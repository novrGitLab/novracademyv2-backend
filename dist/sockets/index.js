"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIo = getIo;
exports.createSocketServer = createSocketServer;
const socket_io_1 = require("socket.io");
const jwt_1 = require("next-auth/jwt");
const db_1 = require("@novr/db");
const types_1 = require("@novr/types");
const groupService_1 = require("../services/groupService");
let io = null;
/** Lets route handlers broadcast without importing socket.io directly. */
function getIo() {
    return io;
}
function parseCookie(cookieHeader, name) {
    if (!cookieHeader)
        return null;
    const match = cookieHeader.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}
async function authenticateSocket(socket) {
    try {
        const authToken = socket.handshake.auth?.token;
        const cookieToken = parseCookie(socket.handshake.headers.cookie, "__Secure-next-auth.session-token") ??
            parseCookie(socket.handshake.headers.cookie, "next-auth.session-token");
        const token = authToken ?? cookieToken;
        if (!token)
            return null;
        const secret = process.env.NEXTAUTH_SECRET;
        if (!secret)
            return null;
        const payload = await (0, jwt_1.decode)({ token, secret });
        if (!payload?.sub)
            return null;
        const user = await db_1.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, status: true } });
        if (!user || user.status !== types_1.UserStatus.ACTIVE)
            return null;
        return { id: user.id };
    }
    catch {
        return null;
    }
}
/**
 * Wires up the real-time layer: authenticated sockets join a personal room
 * (`user:<id>`, for DM delivery) and a room per community group they
 * belong to (`group:<id>`, for live post/comment updates).
 */
function createSocketServer(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
            credentials: true,
        },
    });
    io.on("connection", async (socket) => {
        const user = await authenticateSocket(socket);
        if (!user) {
            socket.disconnect(true);
            return;
        }
        socket.data.userId = user.id;
        socket.join(`user:${user.id}`);
        const groupIds = await (0, groupService_1.getUserGroupIds)(user.id);
        for (const groupId of groupIds) {
            socket.join(`group:${groupId}`);
        }
        socket.on("group:join", (groupId) => socket.join(`group:${groupId}`));
        socket.on("group:leave", (groupId) => socket.leave(`group:${groupId}`));
        socket.on("disconnect", () => { });
    });
    return io;
}
