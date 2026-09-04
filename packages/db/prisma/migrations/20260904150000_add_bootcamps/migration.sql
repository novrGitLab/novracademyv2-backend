-- Bootcamps (student-created, mirror webinars but multi-day + seats + level).
-- Seeded via app: create → UPCOMING, register → BootcampEnrollment.

CREATE TABLE "Bootcamp" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "instructorName" TEXT,
  "instructorId" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "scheduleLabel" TEXT,
  "format" TEXT NOT NULL DEFAULT 'ONLINE',
  "location" TEXT,
  "seatsTotal" INTEGER NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'Beginner',
  "topics" TEXT[] NOT NULL DEFAULT '{}',
  "courseId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'UPCOMING',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
              CONSTRAINT "Bootcamp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Bootcamp_status_startAt_idx" ON "Bootcamp"("status", "startAt");
CREATE INDEX "Bootcamp_courseId_idx" ON "Bootcamp"("courseId");

CREATE TABLE "BootcampEnrollment" (
  "id" TEXT NOT NULL,
  "bootcampId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BootcampEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BootcampEnrollment_bootcampId_userId_key" ON "BootcampEnrollment"("bootcampId", "userId");
CREATE INDEX "BootcampEnrollment_userId_idx" ON "BootcampEnrollment"("userId");

ALTER TABLE "Bootcamp" ADD CONSTRAINT "Bootcamp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Bootcamp" ADD CONSTRAINT "Bootcamp_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Bootcamp" ADD CONSTRAINT "Bootcamp_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BootcampEnrollment" ADD CONSTRAINT "BootcampEnrollment_bootcampId_fkey" FOREIGN KEY ("bootcampId") REFERENCES "Bootcamp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BootcampEnrollment" ADD CONSTRAINT "BootcampEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
