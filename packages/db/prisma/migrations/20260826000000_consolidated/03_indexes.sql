-- Section 3 of 4: indexes only. Run 02_tables.sql first.

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_publicProfileSlug_key" ON "User"("publicProfileSlug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_memberType_idx" ON "User"("memberType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AlumniRecord_userId_key" ON "AlumniRecord"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AlumniRecord_claimToken_key" ON "AlumniRecord"("claimToken");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AlumniRecord_legacyCertUid_key" ON "AlumniRecord"("legacyCertUid");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AlumniRecord_email_idx" ON "AlumniRecord"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AlumniRecord_importBatchId_idx" ON "AlumniRecord"("importBatchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AlumniRecord_claimToken_idx" ON "AlumniRecord"("claimToken");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Course_slug_key" ON "Course"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Course_tenantId_idx" ON "Course"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CourseAiConversation_userId_courseId_key" ON "CourseAiConversation"("userId", "courseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CourseAiMessage_conversationId_idx" ON "CourseAiMessage"("conversationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Lesson_courseId_idx" ON "Lesson"("courseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Lesson_muxUploadId_idx" ON "Lesson"("muxUploadId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Lesson_muxAssetId_idx" ON "Lesson"("muxAssetId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Lesson_courseId_order_key" ON "Lesson"("courseId", "order");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Quiz_lessonId_key" ON "Quiz"("lessonId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QuizQuestion_quizId_idx" ON "QuizQuestion"("quizId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LiveAttendance_lessonId_userId_key" ON "LiveAttendance"("lessonId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Enrollment_paymentId_key" ON "Enrollment"("paymentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Enrollment_userId_courseId_idx" ON "Enrollment"("userId", "courseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Enrollment_status_idx" ON "Enrollment"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Enrollment_expiresAt_idx" ON "Enrollment"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Enrollment_tenantId_idx" ON "Enrollment"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LessonProgress_userId_idx" ON "LessonProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LessonProgress_enrollmentId_lessonId_key" ON "LessonProgress"("enrollmentId", "lessonId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QuizAttempt_userId_idx" ON "QuizAttempt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "QuizAttempt_quizId_userId_attemptNumber_key" ON "QuizAttempt"("quizId", "userId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Certificate_enrollmentId_key" ON "Certificate"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Certificate_alumniRecordId_key" ON "Certificate"("alumniRecordId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Certificate_certUid_key" ON "Certificate"("certUid");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Certificate_userId_idx" ON "Certificate"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Certificate_courseId_idx" ON "Certificate"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Cohort_slug_key" ON "Cohort"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Cohort_tenantId_idx" ON "Cohort"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserCohort_userId_cohortId_key" ON "UserCohort"("userId", "cohortId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CommunityGroup_slug_key" ON "CommunityGroup"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CommunityGroup_type_idx" ON "CommunityGroup"("type");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GroupMember_userId_groupId_key" ON "GroupMember"("userId", "groupId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CommunityPost_authorId_idx" ON "CommunityPost"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CommunityPost_groupId_idx" ON "CommunityPost"("groupId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PostComment_postId_idx" ON "PostComment"("postId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PostReaction_postId_userId_key" ON "PostReaction"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PostBookmark_postId_userId_key" ON "PostBookmark"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MessageThreadParticipant_threadId_userId_key" ON "MessageThreadParticipant"("threadId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Message_threadId_idx" ON "Message"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MessageReadReceipt_messageId_userId_key" ON "MessageReadReceipt"("messageId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MentorProfile_userId_key" ON "MentorProfile"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MentorSession_mentorId_idx" ON "MentorSession"("mentorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MentorSession_menteeId_idx" ON "MentorSession"("menteeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobListing_status_idx" ON "JobListing"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Event_startAt_idx" ON "Event"("startAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EventRsvp_userId_eventId_key" ON "EventRsvp"("userId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Badge_slug_key" ON "Badge"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Campaign_gophishCampaignId_key" ON "Campaign"("gophishCampaignId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Campaign_tenantId_idx" ON "Campaign"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignResult_campaignId_idx" ON "CampaignResult"("campaignId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignResult_userId_idx" ON "CampaignResult"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignResult_employeeEmail_idx" ON "CampaignResult"("employeeEmail");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignResult_gophishCampaignId_idx" ON "CampaignResult"("gophishCampaignId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompliancePolicy_tenantId_idx" ON "CompliancePolicy"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompliancePolicy_courseId_idx" ON "CompliancePolicy"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSubscriber_unsubscribeToken_key" ON "NewsletterSubscriber"("unsubscribeToken");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_status_idx" ON "NewsletterSubscriber"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_email_idx" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketingCampaign_status_idx" ON "MarketingCampaign"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Assessment_type_idx" ON "Assessment"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Assessment_organizationId_idx" ON "Assessment"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Assessment_month_year_idx" ON "Assessment"("month", "year");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssessmentRelease_assessmentId_idx" ON "AssessmentRelease"("assessmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssessmentRelease_userId_idx" ON "AssessmentRelease"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssessmentRelease_cohortId_idx" ON "AssessmentRelease"("cohortId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssessmentQuestion_assessmentId_idx" ON "AssessmentQuestion"("assessmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssessmentAttempt_userId_idx" ON "AssessmentAttempt"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssessmentAttempt_assessmentId_idx" ON "AssessmentAttempt"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentAttempt_userId_assessmentId_type_key" ON "AssessmentAttempt"("userId", "assessmentId", "type");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GrowthRecord_userId_key" ON "GrowthRecord"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GrowthRecord_baselineAttemptId_key" ON "GrowthRecord"("baselineAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GrowthRecord_closingAttemptId_key" ON "GrowthRecord"("closingAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EnrollmentCode_code_key" ON "EnrollmentCode"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EnrollmentCode_courseId_idx" ON "EnrollmentCode"("courseId");

