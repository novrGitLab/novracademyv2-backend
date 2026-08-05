"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPosts = listPosts;
exports.createPost = createPost;
exports.deletePost = deletePost;
exports.toggleReaction = toggleReaction;
exports.toggleBookmark = toggleBookmark;
exports.getPostGroupId = getPostGroupId;
exports.listComments = listComments;
exports.addComment = addComment;
exports.deleteComment = deleteComment;
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const errors_1 = require("../lib/errors");
const postInclude = {
    author: { select: { id: true, name: true, email: true, avatarUrl: true } },
    certificate: { select: { id: true, certUid: true, course: { select: { title: true } } } },
    _count: { select: { comments: true, reactions: true, bookmarks: true } },
};
async function withViewerState(posts, viewerId) {
    const [reactions, bookmarks] = await Promise.all([
        db_1.prisma.postReaction.findMany({
            where: { userId: viewerId, postId: { in: posts.map((p) => p.id) } },
            select: { postId: true, type: true },
        }),
        db_1.prisma.postBookmark.findMany({
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
/**
 * Inside a group, shows that group's posts. Otherwise (the global feed)
 * shows NETWORK-visibility posts only — GROUP/COHORT-scoped posts stay
 * inside their group/cohort context rather than leaking into everyone's feed.
 */
async function listPosts(params) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20));
    const where = params.groupId ? { groupId: params.groupId } : { visibility: types_1.PostVisibility.NETWORK, groupId: null };
    const [posts, total] = await Promise.all([
        db_1.prisma.communityPost.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: postInclude,
        }),
        db_1.prisma.communityPost.count({ where }),
    ]);
    return { posts: await withViewerState(posts, params.viewerId), total, page, pageSize };
}
async function createPost(input) {
    return db_1.prisma.communityPost.create({
        data: {
            authorId: input.authorId,
            content: input.content,
            groupId: input.groupId,
            cohortId: input.cohortId,
            visibility: input.visibility ?? (input.groupId ? types_1.PostVisibility.GROUP : types_1.PostVisibility.NETWORK),
            mediaUrls: input.mediaUrls ?? [],
            isCertificateShare: input.isCertificateShare ?? false,
            certificateId: input.certificateId,
        },
        include: postInclude,
    });
}
async function deletePost(postId, requesterId, isAdmin) {
    const post = await db_1.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post)
        throw new errors_1.NotFoundError("Post not found");
    if (post.authorId !== requesterId && !isAdmin) {
        throw new errors_1.NotFoundError("Post not found"); // don't leak existence to non-owners
    }
    await db_1.prisma.communityPost.delete({ where: { id: postId } });
}
/** Reacting again with the same type removes the reaction (toggle); a different type switches it. */
async function toggleReaction(postId, userId, type) {
    const existing = await db_1.prisma.postReaction.findUnique({ where: { postId_userId: { postId, userId } } });
    if (existing && existing.type === type) {
        await db_1.prisma.postReaction.delete({ where: { id: existing.id } });
        return { reacted: false, type: null };
    }
    await db_1.prisma.postReaction.upsert({
        where: { postId_userId: { postId, userId } },
        create: { postId, userId, type },
        update: { type },
    });
    return { reacted: true, type };
}
async function toggleBookmark(postId, userId) {
    const existing = await db_1.prisma.postBookmark.findUnique({ where: { postId_userId: { postId, userId } } });
    if (existing) {
        await db_1.prisma.postBookmark.delete({ where: { id: existing.id } });
        return { bookmarked: false };
    }
    await db_1.prisma.postBookmark.create({ data: { postId, userId } });
    return { bookmarked: true };
}
async function getPostGroupId(postId) {
    const post = await db_1.prisma.communityPost.findUnique({ where: { id: postId }, select: { groupId: true } });
    return post?.groupId ?? null;
}
async function listComments(postId) {
    return db_1.prisma.postComment.findMany({
        where: { postId },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
}
async function addComment(postId, authorId, content, parentCommentId) {
    return db_1.prisma.postComment.create({
        data: { postId, authorId, content, parentCommentId },
        include: { author: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
}
async function deleteComment(commentId, requesterId, isAdmin) {
    const comment = await db_1.prisma.postComment.findUnique({ where: { id: commentId } });
    if (!comment)
        throw new errors_1.NotFoundError("Comment not found");
    if (comment.authorId !== requesterId && !isAdmin) {
        throw new errors_1.NotFoundError("Comment not found");
    }
    await db_1.prisma.postComment.delete({ where: { id: commentId } });
}
