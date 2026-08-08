// Mirrors the enums defined in packages/db/prisma/schema.prisma.
// Kept as plain TS (not re-exported from @prisma/client) so non-API
// consumers (e.g. the mobile app) can depend on this package without
// pulling in Prisma's generated client.

export const UserRole = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ORG_ADMIN: "ORG_ADMIN",
  MANAGER: "MANAGER",
  LEARNER: "LEARNER",
  LEGACY_ALUMNI: "LEGACY_ALUMNI",
  COMMUNITY_ONLY: "COMMUNITY_ONLY",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const MemberType = {
  LEGACY_ALUMNI: "LEGACY_ALUMNI",
  NEW_LEARNER: "NEW_LEARNER",
  COMMUNITY_ONLY: "COMMUNITY_ONLY",
} as const;
export type MemberType = (typeof MemberType)[keyof typeof MemberType];

export const UserStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  PENDING: "PENDING",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const ReputationLevel = {
  NEWCOMER: "NEWCOMER",
  MEMBER: "MEMBER",
  CONTRIBUTOR: "CONTRIBUTOR",
  MENTOR: "MENTOR",
  LEGEND: "LEGEND",
} as const;
export type ReputationLevel = (typeof ReputationLevel)[keyof typeof ReputationLevel];

export const REPUTATION_XP_THRESHOLDS: Record<ReputationLevel, number> = {
  NEWCOMER: 0,
  MEMBER: 100,
  CONTRIBUTOR: 300,
  MENTOR: 700,
  LEGEND: 1500,
};

export const CourseStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;
export type CourseStatus = (typeof CourseStatus)[keyof typeof CourseStatus];

export const LessonType = {
  VIDEO: "VIDEO",
  PDF: "PDF",
  QUIZ: "QUIZ",
  LIVE: "LIVE",
} as const;
export type LessonType = (typeof LessonType)[keyof typeof LessonType];

export const QuestionType = {
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  TRUE_FALSE: "TRUE_FALSE",
  SHORT_ANSWER: "SHORT_ANSWER",
} as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

export const EnrollmentSource = {
  SELF_PAID: "SELF_PAID",
  ADMIN_ASSIGNED: "ADMIN_ASSIGNED",
  BULK: "BULK",
  COHORT: "COHORT",
} as const;
export type EnrollmentSource = (typeof EnrollmentSource)[keyof typeof EnrollmentSource];

export const EnrollmentStatus = {
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  PENDING: "PENDING",
  CANCELLED: "CANCELLED",
} as const;
export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export const PaymentProvider = {
  STRIPE: "STRIPE",
  PAYSTACK: "PAYSTACK",
} as const;
export type PaymentProvider = (typeof PaymentProvider)[keyof typeof PaymentProvider];

export const PaymentStatus = {
  PENDING: "PENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const GroupType = {
  GENERAL: "GENERAL",
  COHORT: "COHORT",
  INTEREST: "INTEREST",
  COURSE: "COURSE",
} as const;
export type GroupType = (typeof GroupType)[keyof typeof GroupType];

export const PostVisibility = {
  NETWORK: "NETWORK",
  GROUP: "GROUP",
  COHORT: "COHORT",
} as const;
export type PostVisibility = (typeof PostVisibility)[keyof typeof PostVisibility];

export const ReactionType = {
  LIKE: "LIKE",
  CELEBRATE: "CELEBRATE",
  INSIGHTFUL: "INSIGHTFUL",
} as const;
export type ReactionType = (typeof ReactionType)[keyof typeof ReactionType];

export const EventVisibility = {
  ALL_MEMBERS: "ALL_MEMBERS",
  ENROLLED_ONLY: "ENROLLED_ONLY",
} as const;
export type EventVisibility = (typeof EventVisibility)[keyof typeof EventVisibility];

export const EventRsvpStatus = {
  GOING: "GOING",
  WAITLIST: "WAITLIST",
  CANCELLED: "CANCELLED",
} as const;
export type EventRsvpStatus = (typeof EventRsvpStatus)[keyof typeof EventRsvpStatus];

export const MentorSessionStatus = {
  REQUESTED: "REQUESTED",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type MentorSessionStatus = (typeof MentorSessionStatus)[keyof typeof MentorSessionStatus];

export const JobLocationType = {
  REMOTE: "REMOTE",
  ONSITE: "ONSITE",
  HYBRID: "HYBRID",
} as const;
export type JobLocationType = (typeof JobLocationType)[keyof typeof JobLocationType];

export const JobListingStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
} as const;
export type JobListingStatus = (typeof JobListingStatus)[keyof typeof JobListingStatus];

export const BadgeTriggerType = {
  COURSE_SPECIFIC: "COURSE_SPECIFIC",
  PLATFORM_MILESTONE: "PLATFORM_MILESTONE",
  MANUAL: "MANUAL",
} as const;
export type BadgeTriggerType = (typeof BadgeTriggerType)[keyof typeof BadgeTriggerType];

export const NotificationType = {
  ENROLLMENT_CONFIRMATION: "ENROLLMENT_CONFIRMATION",
  LESSON_REMINDER: "LESSON_REMINDER",
  ENROLLMENT_EXPIRY_WARNING: "ENROLLMENT_EXPIRY_WARNING",
  QUIZ_RESULT: "QUIZ_RESULT",
  CERTIFICATE_ISSUED: "CERTIFICATE_ISSUED",
  COMMUNITY_MENTION: "COMMUNITY_MENTION",
  DM_RECEIVED: "DM_RECEIVED",
  EVENT_REMINDER: "EVENT_REMINDER",
  GENERAL: "GENERAL",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/** Roles allowed to access the admin dashboard. */
export const ADMIN_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN];

/** Roles allowed to manage a team's enrollments/reports. */
export const MANAGER_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.MANAGER];

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  memberType: MemberType;
  status: UserStatus;
}
