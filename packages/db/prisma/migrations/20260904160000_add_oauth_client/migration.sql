-- OAuth2 client_credentials — scoped machine-to-machine API tokens.

CREATE TABLE IF NOT EXISTS "OAuthClient" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL UNIQUE,
  "clientSecretHash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OAuthClient_createdById_idx" ON "OAuthClient"("createdById");

ALTER TABLE "OAuthClient" DROP CONSTRAINT IF EXISTS "OAuthClient_createdById_fkey";
ALTER TABLE "OAuthClient" ADD CONSTRAINT "OAuthClient_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
