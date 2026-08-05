import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { decode } from "next-auth/jwt";
import { prisma } from "@novr/db";
import { UserStatus } from "@novr/types";
import { getUserGroupIds } from "../services/groupService";

let io: Server | null = null;

/** Lets route handlers broadcast without importing socket.io directly. */
export function getIo(): Server | null {
  return io;
}

function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function authenticateSocket(socket: Socket): Promise<{ id: string } | null> {
  try {
    const authToken = socket.handshake.auth?.token as string | undefined;
    const cookieToken =
      parseCookie(socket.handshake.headers.cookie, "__Secure-next-auth.session-token") ??
      parseCookie(socket.handshake.headers.cookie, "next-auth.session-token");
    const token = authToken ?? cookieToken;
    if (!token) return null;

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) return null;

    const payload = await decode({ token, secret });
    if (!payload?.sub) return null;

    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, status: true } });
    if (!user || user.status !== UserStatus.ACTIVE) return null;

    return { id: user.id };
  } catch {
    return null;
  }
}

/**
 * Wires up the real-time layer: authenticated sockets join a personal room
 * (`user:<id>`, for DM delivery) and a room per community group they
 * belong to (`group:<id>`, for live post/comment updates).
 */
export function createSocketServer(httpServer: HttpServer) {
  io = new Server(httpServer, {
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

    const groupIds = await getUserGroupIds(user.id);
    for (const groupId of groupIds) {
      socket.join(`group:${groupId}`);
    }

    socket.on("group:join", (groupId: string) => socket.join(`group:${groupId}`));
    socket.on("group:leave", (groupId: string) => socket.leave(`group:${groupId}`));

    socket.on("disconnect", () => {});
  });

  return io;
}
