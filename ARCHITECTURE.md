# Backend Architecture

## Overview

Express.js API server handling all business logic, database operations, and integrations.

## Authentication

The backend validates NextAuth JWT tokens issued by the frontend:
- Extracts `__Secure-next-auth.session-token` or `next-auth.session-token` cookies
- Or `Authorization: Bearer <token>` header
- Decodes JWT using `next-auth/jwt` with shared `NEXTAUTH_SECRET`
- Re-fetches user from database to check `status === ACTIVE`

## Database

Uses Prisma ORM with PostgreSQL (Supabase):
- `DATABASE_URL` - Pooled connection via PgBouncer (for queries)
- `DIRECT_URL` - Direct connection (for migrations)

## Background Jobs

BullMQ queues for async operations:
- Email queue (Resend)
- Certificate queue (PDF generation)

Requires Redis (`REDIS_URL`). If not configured, queues gracefully skip.

## Real-time

Socket.IO server for:
- Direct messages
- Live post/comment updates
- Group notifications

## Health Check

`GET /health` returns `{ status: 'ok', timestamp: string }`
