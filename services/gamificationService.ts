import { prisma } from "@novr/db";
import { Prisma } from "@prisma/client";
import { NotificationType, REPUTATION_XP_THRESHOLDS } from "@novr/types";
import type { ReputationLevel } from "@novr/types";

const LEVEL_ORDER: ReputationLevel[] = ["NEWCOMER", "MEMBER", "CONTRIBUTOR", "MENTOR", "LEGEND"];

async function createAchievementNotification(userId: string, type: string, title: string, content: string) {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type: (type as NotificationType) ?? NotificationType.GENERAL,
        title,
        content,
      },
    });
  } catch (err) {
    console.error("Failed to create achievement notification:", err instanceof Error ? err.message : err);
  }
}

/**
 * Awards XP to a user, creates an audit log entry, and promotes their
 * reputation level if a threshold was crossed. Idempotent: callers should
 * guard against double-awarding at the call site (e.g. check
 * LessonProgress.completed before awarding lesson XP).
 */
export async function awardXP(userId: string, amount: number, reason: string, metadata?: Record<string, unknown>) {
  if (amount <= 0) return;

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { xp: { increment: amount } } }),
    prisma.xpLog.create({ data: { userId, amount, reason, metadata: metadata as unknown as Prisma.InputJsonValue } }),
  ]);

  await updateLevel(userId);
}

/**
 * Reads the user's current XP and promotes their reputationLevel if the
 * XP now meets a higher threshold. Levels only go up, never down. Returns
 * the user's level (and whether it just changed) so callers can notify.
 */
export async function updateLevel(userId: string): Promise<{ level: ReputationLevel; changed: boolean }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { xp: true, reputationLevel: true },
  });

  let newLevel: ReputationLevel = "NEWCOMER";
  for (const level of LEVEL_ORDER) {
    if (user.xp >= REPUTATION_XP_THRESHOLDS[level]) {
      newLevel = level;
    }
  }

  const changed = newLevel !== user.reputationLevel;
  if (changed) {
    await prisma.user.update({ where: { id: userId }, data: { reputationLevel: newLevel } });
    await createAchievementNotification(
      userId,
      NotificationType.LEVEL_UP,
      "Level up!",
      `You reached ${newLevel}. Keep it up!`
    );
  }
  return { level: newLevel, changed };
}

interface BadgeCondition {
  slug: string;
  check: (counts: UserCounts) => boolean;
}

interface UserCounts {
  enrollmentCount: number;
  completedCourseCount: number;
  quizPassedCount: number;
  labSolvedCount: number;
  communityActivityCount: number;
}

async function getUserCounts(userId: string): Promise<UserCounts> {
  const [enrollmentCount, completedCourseCount, quizPassedCount, labSolvedCount, communityActivityCount] =
    await Promise.all([
      prisma.enrollment.count({ where: { userId } }),
      prisma.enrollment.count({ where: { userId, completedAt: { not: null } } }),
      prisma.quizAttempt.count({ where: { userId, passed: true } }),
      prisma.labSolve.count({ where: { userId } }),
      prisma.$transaction([
        prisma.communityPost.count({ where: { authorId: userId } }),
        prisma.postComment.count({ where: { authorId: userId } }),
      ]).then(([posts, comments]) => posts + comments),
    ]);

  return { enrollmentCount, completedCourseCount, quizPassedCount, labSolvedCount, communityActivityCount };
}

const BADGE_CONDITIONS: BadgeCondition[] = [
  { slug: "first-course", check: (c) => c.enrollmentCount >= 1 },
  { slug: "course-completed", check: (c) => c.completedCourseCount >= 1 },
  { slug: "community-star", check: (c) => c.communityActivityCount >= 5 },
  { slug: "quiz-master", check: (c) => c.quizPassedCount >= 5 },
  { slug: "lab-solver", check: (c) => c.labSolvedCount >= 1 },
  { slug: "streak-3", check: (c) => c.completedCourseCount >= 3 },
  { slug: "knowledge-seeker", check: (c) => c.completedCourseCount >= 5 },
  { slug: "goal-getter", check: (c) => c.completedCourseCount >= 10 },
];

/**
 * Checks all badge conditions and awards any that the user now qualifies
 * for but hasn't earned yet. For each newly awarded badge, calls awardXP
 * to grant the badge's XP value. Safe to call after every XP award —
 * short-circuits quickly when no new badges are earned.
 */
export async function checkAndAwardBadges(userId: string) {
  const counts = await getUserCounts(userId);

  const earnedBadges = await prisma.userBadge.findMany({ where: { userId }, select: { badge: { select: { slug: true } } } });
  const earnedSlugs = new Set(earnedBadges.map((ub) => ub.badge.slug));

  const toAward = BADGE_CONDITIONS.filter((bc) => !earnedSlugs.has(bc.slug) && bc.check(counts));
  if (toAward.length === 0) return [];

  const badges = await prisma.badge.findMany({ where: { slug: { in: toAward.map((bc) => bc.slug) } } });
  const badgeBySlug = new Map(badges.map((b) => [b.slug, b]));

  const awarded: string[] = [];
  for (const bc of toAward) {
    const badge = badgeBySlug.get(bc.slug);
    if (!badge) continue;

    try {
      await prisma.userBadge.create({ data: { userId, badgeId: badge.id } });
      if (badge.xpValue > 0) {
        await prisma.$transaction([
          prisma.user.update({ where: { id: userId }, data: { xp: { increment: badge.xpValue } } }),
          prisma.xpLog.create({ data: { userId, amount: badge.xpValue, reason: "badge_awarded", metadata: { badgeSlug: badge.slug } } }),
        ]);
        await updateLevel(userId);
      }
      await createAchievementNotification(
        userId,
        NotificationType.BADGE_AWARDED,
        "Badge unlocked!",
        badge.description
          ? `${badge.name} — ${badge.description}`
          : `You earned the ${badge.name} badge!`
      );
      awarded.push(badge.slug);
    } catch {
      // Unique constraint violation — badge already awarded (race condition). Ignore.
    }
  }

  return awarded;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  xp: number;
  reputationLevel: ReputationLevel;
  badgeCount: number;
}

/**
 * Returns the global leaderboard for learners, ordered by XP descending.
 */
export async function getLeaderboard(limit = 50, offset = 0): Promise<LeaderboardEntry[]> {
  const users = await prisma.user.findMany({
    where: { role: "LEARNER" },
    orderBy: { xp: "desc" },
    skip: offset,
    take: limit,
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      xp: true,
      reputationLevel: true,
      _count: { select: { userBadges: true } },
    },
  });

  return users.map((u, i) => ({
    rank: offset + i + 1,
    userId: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    xp: u.xp,
    reputationLevel: u.reputationLevel,
    badgeCount: u._count.userBadges,
  }));
}

export interface UserGamification {
  xp: number;
  reputationLevel: ReputationLevel;
  nextLevel: ReputationLevel | null;
  nextLevelXp: number | null;
  levelProgressPct: number;
  badges: { slug: string; name: string; description: string | null; xpValue: number; iconUrl: string | null; awardedAt: Date }[];
  recentXpLogs: { id: string; amount: number; reason: string; metadata: unknown; createdAt: Date }[];
}

/**
 * Returns the full gamification state for a single user: XP, level,
 * progress to next level, earned badges, and recent XP history.
 */
export async function getUserGamification(userId: string): Promise<UserGamification> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { xp: true, reputationLevel: true },
  });

  const currentLevelIdx = LEVEL_ORDER.indexOf(user.reputationLevel);
  const nextLevel = currentLevelIdx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[currentLevelIdx + 1] : null;
  const currentThreshold = REPUTATION_XP_THRESHOLDS[user.reputationLevel];
  const nextLevelXp = nextLevel ? REPUTATION_XP_THRESHOLDS[nextLevel] : null;

  let levelProgressPct = 100;
  if (nextLevelXp !== null) {
    const range = nextLevelXp - currentThreshold;
    levelProgressPct = range > 0 ? Math.min(100, ((user.xp - currentThreshold) / range) * 100) : 100;
  }

  const [userBadges, recentXpLogs] = await Promise.all([
    prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { awardedAt: "desc" },
      take: 50,
    }),
    prisma.xpLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return {
    xp: user.xp,
    reputationLevel: user.reputationLevel,
    nextLevel,
    nextLevelXp,
    levelProgressPct,
    badges: userBadges.map((ub) => ({
      slug: ub.badge.slug,
      name: ub.badge.name,
      description: ub.badge.description,
      xpValue: ub.badge.xpValue,
      iconUrl: ub.badge.iconUrl,
      awardedAt: ub.awardedAt,
    })),
    recentXpLogs: recentXpLogs.map((log) => ({
      id: log.id,
      amount: log.amount,
      reason: log.reason,
      metadata: log.metadata,
      createdAt: log.createdAt,
    })),
  };
}

/**
 * Returns all badges with the user's earned status.
 */
export async function getAllBadgesWithStatus(userId: string) {
  const [allBadges, userBadges] = await Promise.all([
    prisma.badge.findMany({ orderBy: { name: "asc" } }),
    prisma.userBadge.findMany({ where: { userId }, select: { badgeId: true, awardedAt: true } }),
  ]);

  const earnedMap = new Map(userBadges.map((ub) => [ub.badgeId, ub.awardedAt]));

  return allBadges.map((badge) => ({
    slug: badge.slug,
    name: badge.name,
    description: badge.description,
    xpValue: badge.xpValue,
    iconUrl: badge.iconUrl,
    triggerType: badge.triggerType,
    earned: earnedMap.has(badge.id),
    awardedAt: earnedMap.get(badge.id) ?? null,
  }));
}
