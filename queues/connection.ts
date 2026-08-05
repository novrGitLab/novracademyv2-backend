// Plain connection options rather than a shared ioredis instance: BullMQ
// bundles its own nested copy of ioredis, and passing an instance created
// from our top-level `ioredis` package hits a class-identity mismatch
// (structurally identical, but TS treats them as different types) — the
// same category of bug as duplicate React copies elsewhere in this repo.
// A plain object sidesteps it entirely; BullMQ creates its own client
// from these options internally.
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    // Required by BullMQ's blocking commands.
    maxRetriesPerRequest: null as null,
  };
}

export const redisConnectionOptions = process.env.REDIS_URL ? parseRedisUrl(process.env.REDIS_URL) : null;
