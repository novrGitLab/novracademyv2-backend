-- Performance indexes (audit Phase 1):
-- 1. Payment.providerRef — every payment webhook looks up by providerRef;
--    was a sequential scan per webhook, and the unique guards against
--    duplicate webhook activation.
-- 2. GroupMember.groupId — member-list lookups filter by groupId alone and
--    cannot use the (userId, groupId) unique constraint.
-- 3. MessageThreadParticipant.userId — "my threads" lookups filter by userId
--    alone and cannot use the (threadId, userId) unique constraint.

CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

CREATE INDEX "GroupMember_groupId_idx" ON "GroupMember"("groupId");

CREATE INDEX "MessageThreadParticipant_userId_idx" ON "MessageThreadParticipant"("userId");
