import { prisma } from "@novr/db";
import { PostVisibility, ReactionType } from "@novr/types";
import { NotFoundError } from "../lib/errors";

const postInclude = {
  author: { select: { id: true, name: true, email: true, avatarUrl: true } },
  certificate: { select: { id: true, certUid: true, course: { select: { title: true } } } },
  _count: { select: { comments: true, reactions: true, bookmarks: true } },
} as const;

async function withViewerState<T extends { id: string }>(posts: T[], viewerId: string) {
  const [reactions, bookmarks] = await Promise.all([
    prisma.postReaction.findMany({
      where: { userId: viewerId, postId: { in: posts.map((p) => p.id) } },
      select: { postId: true, type: true },
    }),
    prisma.postBookmark.findMany({
      where: { userId: viewerId, postId: { in: posts.map((p) => p.id) } },
      select: { postId: true },
    }),
  ]);
  const reactionByPost = new Map(reactions.map((r) => [r.postId, r.type]));
  const bookmarkedIds = new Set(bookmarks.map((b) => b.postId));

  return posts.map((post) => ({
    ...post,
    viewerReaction: reactionByPost.get(post.id) ?? null,
    viewerBookmarked: bookmarkedIds.has(post.id),
  }));
}

export interface ListPostsParams {
  viewerId: string;
  groupId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Inside a group, shows that group's posts. Otherwise (the global feed)
 * shows NETWORK-visibility posts only — GROUP/COHORT-scoped posts stay
 * inside their group/cohort context rather than leaking into everyone's feed.
 */
export async function listPosts(params: ListPostsParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20));

  const where = params.groupId ? { groupId: params.groupId } : { visibility: PostVisibility.NETWORK, groupId: null };

  const [posts, total] = await Promise.all([
    prisma.communityPost.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: postInclude,
    }),
    prisma.communityPost.count({ where }),
  ]);

  return { posts: await withViewerState(posts, params.viewerId), total, page, pageSize };
}

export interface CreatePostInput {
  authorId: string;
  content: string;
  groupId?: string;
  cohortId?: string;
  visibility?: PostVisibility;
  mediaUrls?: string[];
  isCertificateShare?: boolean;
  certificateId?: string;
}

export async function createPost(input: CreatePostInput) {
  return prisma.communityPost.create({
    data: {
      authorId: input.authorId,
      content: input.content,
      groupId: input.groupId,
      cohortId: input.cohortId,
      visibility: input.visibility ?? (input.groupId ? PostVisibility.GROUP : PostVisibility.NETWORK),
      mediaUrls: input.mediaUrls ?? [],
      isCertificateShare: input.isCertificateShare ?? false,
      certificateId: input.certificateId,
    },
    include: postInclude,
  });
}

export async function deletePost(postId: string, requesterId: string, isAdmin: boolean) {
  const post = await prisma.communityPost.findUnique({ where: { id: postId } });
  if (!post) throw new NotFoundError("Post not found");
  if (post.authorId !== requesterId && !isAdmin) {
    throw new NotFoundError("Post not found"); // don't leak existence to non-owners
  }
  await prisma.communityPost.delete({ where: { id: postId } });
}

/** Reacting again with the same type removes the reaction (toggle); a different type switches it. */
export async function toggleReaction(postId: string, userId: string, type: ReactionType) {
  const existing = await prisma.postReaction.findUnique({ where: { postId_userId: { postId, userId } } });

  if (existing && existing.type === type) {
    await prisma.postReaction.delete({ where: { id: existing.id } });
    return { reacted: false, type: null };
  }

  await prisma.postReaction.upsert({
    where: { postId_userId: { postId, userId } },
    create: { postId, userId, type },
    update: { type },
  });
  return { reacted: true, type };
}

export async function toggleBookmark(postId: string, userId: string) {
  const existing = await prisma.postBookmark.findUnique({ where: { postId_userId: { postId, userId } } });
  if (existing) {
    await prisma.postBookmark.delete({ where: { id: existing.id } });
    return { bookmarked: false };
  }
  await prisma.postBookmark.create({ data: { postId, userId } });
  return { bookmarked: true };
}

export async function getPostGroupId(postId: string): Promise<string | null> {
  const post = await prisma.communityPost.findUnique({ where: { id: postId }, select: { groupId: true } });
  return post?.groupId ?? null;
}

export async function listComments(postId: string) {
  return prisma.postComment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });
}

export async function addComment(postId: string, authorId: string, content: string, parentCommentId?: string) {
  return prisma.postComment.create({
    data: { postId, authorId, content, parentCommentId },
    include: { author: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });
}

export async function deleteComment(commentId: string, requesterId: string, isAdmin: boolean) {
  const comment = await prisma.postComment.findUnique({ where: { id: commentId } });
  if (!comment) throw new NotFoundError("Comment not found");
  if (comment.authorId !== requesterId && !isAdmin) {
    throw new NotFoundError("Comment not found");
  }
  await prisma.postComment.delete({ where: { id: commentId } });
}
