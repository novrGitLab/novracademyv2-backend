import { prisma } from "@novr/db";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

const DEFAULT_TOKEN_TTL_S = 3600;

const ALLOWED_SCOPES = new Set([
  "read:courses",
  "read:lessons",
  "read:enrollments",
  "write:enrollments",
  "read:users",
  "write:users",
  "read:analytics",
  "read:community",
  "write:community",
  "admin:*",
  "webhook:paystack",
]);

/**
 * Create a new OAuth client (machine API key).
 * Returns the plaintext `clientSecret` once — only the hash is stored.
 */
export async function createOAuthClient(input: {
  scopes: string[];
  createdById?: string | null;
}): Promise<{ clientId: string; clientSecret: string; scopes: string[] }> {
  for (const s of input.scopes) {
    if (!ALLOWED_SCOPES.has(s)) {
      throw new Error(`Unknown scope: ${s}`);
    }
  }

  const clientId = crypto.randomUUID();
  const clientSecret = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const clientSecretHash = await bcrypt.hash(clientSecret, 10);

  await prisma.oAuthClient.create({
    data: {
      clientId,
      clientSecretHash,
      scopes: input.scopes,
      createdById: input.createdById ?? null,
    },
  });

  return { clientId, clientSecret, scopes: input.scopes };
}

/**
 * client_credentials grant: validates `client_id`/`client_secret` and issues
 * a short-lived JWS with a `scope` claim. The access token is verified by
 * the same `jwtVerify(NEXTAUTH_SECRET)` path the session tokens use.
 * `requestScope` (space-separated, e.g. "read:courses write:enrollments")
 * must be a subset of the client's `scopes`; if omitted, all of the client's
 * scopes are granted.
 */
export async function issueClientCredentialsToken(input: {
  clientId: string;
  clientSecret: string;
  requestScope?: string;
}) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId: input.clientId } });
  if (!client || !client.isActive) {
    throw new Error("Invalid client credentials");
  }

  const ok = await bcrypt.compare(input.clientSecret, client.clientSecretHash);
  if (!ok) throw new Error("Invalid client credentials");

  let granted: string[] = client.scopes;
  if (input.requestScope) {
    const requested = input.requestScope.split(" ").filter(Boolean);
    const disallowed = requested.filter((s) => !client.scopes.includes(s));
    if (disallowed.length > 0) {
      throw new Error(`Requested scope not allowed: ${disallowed.join(", ")}`);
    }
    granted = requested;
  }

  const ttl = DEFAULT_TOKEN_TTL_S;
  const scope = granted.join(" ");

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not configured");

  const jti = crypto.randomUUID();

  const token = await new SignJWT({ sub: client.clientId, scope, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(new TextEncoder().encode(secret));

  return { access_token: token, token_type: "Bearer" as const, expires_in: ttl, scope };
}

export const OAUTH_ALLOWED_SCOPES = [...ALLOWED_SCOPES];
export const OAUTH_TTL_S = DEFAULT_TOKEN_TTL_S;
