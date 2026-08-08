import { PrismaClient, UserRole, MemberType, UserStatus, CourseStatus, LessonType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD_HASH_CACHE = new Map<string, string>();

async function hash(password: string): Promise<string> {
  if (!PASSWORD_HASH_CACHE.has(password)) {
    PASSWORD_HASH_CACHE.set(password, await bcrypt.hash(password, 10));
  }
  return PASSWORD_HASH_CACHE.get(password)!;
}

async function main() {
  console.log(" Seeding database...\n");

  // ── Users ──────────────────────────────────────────────────────────────

  const admin = await prisma.user.upsert({
    where: { email: "admin@novracademy.com" },
    update: {},
    create: {
      email: "admin@novracademy.com",
      name: "Super Admin",
      passwordHash: await hash("admin1234"),
      role: UserRole.SUPER_ADMIN,
      memberType: MemberType.NEW_LEARNER,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`  admin       ${admin.email} / admin1234  (${admin.role})`);

  const orgAdmin = await prisma.user.upsert({
    where: { email: "org@novracademy.com" },
    update: {},
    create: {
      email: "org@novracademy.com",
      name: "Org Admin",
      passwordHash: await hash("org1234"),
      role: UserRole.ORG_ADMIN,
      memberType: MemberType.NEW_LEARNER,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`  org admin   ${orgAdmin.email} / org1234  (${orgAdmin.role})`);

  const institutionAdmin = await prisma.user.upsert({
    where: { email: "institution@novracademy.com" },
    update: {},
    create: {
      email: "institution@novracademy.com",
      name: "Institution Admin",
      passwordHash: await hash("institution1234"),
      role: UserRole.INSTITUTION_ADMIN,
      memberType: MemberType.NEW_LEARNER,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`  institution ${institutionAdmin.email} / institution1234  (${institutionAdmin.role})`);

  const manager = await prisma.user.upsert({
    where: { email: "manager@novracademy.com" },
    update: {},
    create: {
      email: "manager@novracademy.com",
      name: "Team Manager",
      passwordHash: await hash("manager1234"),
      role: UserRole.MANAGER,
      memberType: MemberType.NEW_LEARNER,
      status: UserStatus.ACTIVE,
      managerId: orgAdmin.id,
    },
  });
  console.log(`  manager     ${manager.email} / manager1234  (${manager.role})`);

  const studentData = [
    { email: "ada@novracademy.com", name: "Ada Lovelace", password: "student1234" },
    { email: "grace@novracademy.com", name: "Grace Hopper", password: "student1234" },
    { email: "linus@novracademy.com", name: "Linus Torvalds", password: "student1234" },
    { email: "margaret@novracademy.com", name: "Margaret Hamilton", password: "student1234" },
    { email: "tim@novracademy.com", name: "Tim Berners-Lee", password: "student1234" },
  ];

  const students = [];
  for (const s of studentData) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        name: s.name,
        passwordHash: await hash(s.password),
        role: UserRole.LEARNER,
        memberType: MemberType.NEW_LEARNER,
        status: UserStatus.ACTIVE,
        managerId: manager.id,
      },
    });
    students.push(user);
    console.log(`  student     ${user.email} / ${s.password}  (${user.name})`);
  }

  // ── Cohorts ────────────────────────────────────────────────────────────

  const cohort2026 = await prisma.cohort.upsert({
    where: { slug: "cohort-2026" },
    update: {},
    create: {
      name: "Cohort 2026",
      slug: "cohort-2026",
      year: 2026,
      description: "Main learning cohort for 2026",
    },
  });

  const cohortAlumni = await prisma.cohort.upsert({
    where: { slug: "alumni-2025" },
    update: {},
    create: {
      name: "Alumni 2025",
      slug: "alumni-2025",
      year: 2025,
      description: "Graduated alumni from 2025",
    },
  });
  console.log(`\n  cohorts     ${cohort2026.name}, ${cohortAlumni.name}`);

  // Assign students to cohort
  for (const student of students) {
    await prisma.userCohort.upsert({
      where: { userId_cohortId: { userId: student.id, cohortId: cohort2026.id } },
      update: {},
      create: { userId: student.id, cohortId: cohort2026.id },
    });
  }

  // ── Courses ────────────────────────────────────────────────────────────

  const webDevCourse = await prisma.course.upsert({
    where: { slug: "web-development-fundamentals" },
    update: {},
    create: {
      title: "Web Development Fundamentals",
      slug: "web-development-fundamentals",
      description: "Master HTML, CSS, JavaScript and modern web frameworks from scratch.",
      status: CourseStatus.PUBLISHED,
      priceCents: 0,
      currency: "USD",
      passMarkPct: 70,
      createdById: admin.id,
    },
  });

  const dataScienceCourse = await prisma.course.upsert({
    where: { slug: "data-science-with-python" },
    update: {},
    create: {
      title: "Data Science with Python",
      slug: "data-science-with-python",
      description: "Learn data analysis, visualization, and machine learning with Python.",
      status: CourseStatus.PUBLISHED,
      priceCents: 0,
      currency: "USD",
      passMarkPct: 70,
      createdById: admin.id,
    },
  });

  const cybersecurityCourse = await prisma.course.upsert({
    where: { slug: "cybersecurity-essentials" },
    update: {},
    create: {
      title: "Cybersecurity Essentials",
      slug: "cybersecurity-essentials",
      description: "Introduction to cybersecurity concepts, ethical hacking, and defense strategies.",
      status: CourseStatus.DRAFT,
      priceCents: 0,
      currency: "USD",
      passMarkPct: 75,
      createdById: admin.id,
    },
  });
  console.log(`\n  courses     ${webDevCourse.title}, ${dataScienceCourse.title}, ${cybersecurityCourse.title}`);

  // ── Lessons (Web Dev course) ───────────────────────────────────────────

  const webLessons = [
    { title: "Introduction to HTML", type: LessonType.VIDEO, order: 1, durationSeconds: 1800 },
    { title: "CSS Layout & Flexbox", type: LessonType.VIDEO, order: 2, durationSeconds: 2400 },
    { title: "JavaScript Basics", type: LessonType.VIDEO, order: 3, durationSeconds: 3000 },
    { title: "DOM Manipulation", type: LessonType.PDF, order: 4 },
    { title: "Module 1 Quiz", type: LessonType.QUIZ, order: 5 },
    { title: "React Introduction", type: LessonType.VIDEO, order: 6, durationSeconds: 3600 },
    { title: "Building a Portfolio Project", type: LessonType.LIVE, order: 7 },
  ];

  for (const lesson of webLessons) {
    await prisma.lesson.upsert({
      where: { courseId_order: { courseId: webDevCourse.id, order: lesson.order } },
      update: {},
      create: { courseId: webDevCourse.id, ...lesson },
    });
  }

  // ── Lessons (Data Science course) ──────────────────────────────────────

  const dsLessons = [
    { title: "Python Refresher", type: LessonType.VIDEO, order: 1, durationSeconds: 2100 },
    { title: "NumPy & Pandas", type: LessonType.VIDEO, order: 2, durationSeconds: 2700 },
    { title: "Data Visualization with Matplotlib", type: LessonType.VIDEO, order: 3, durationSeconds: 2400 },
    { title: "Intro to Machine Learning", type: LessonType.PDF, order: 4 },
    { title: "Module 1 Quiz", type: LessonType.QUIZ, order: 5 },
  ];

  for (const lesson of dsLessons) {
    await prisma.lesson.upsert({
      where: { courseId_order: { courseId: dataScienceCourse.id, order: lesson.order } },
      update: {},
      create: { courseId: dataScienceCourse.id, ...lesson },
    });
  }
  console.log(`  lessons     ${webLessons.length} (Web Dev) + ${dsLessons.length} (Data Science)`);

  // ── Enrollments ────────────────────────────────────────────────────────

  for (const student of students.slice(0, 3)) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: student.id, courseId: webDevCourse.id } },
      update: {},
      create: {
        userId: student.id,
        courseId: webDevCourse.id,
        cohortId: cohort2026.id,
        assignedById: admin.id,
      },
    });
  }

  for (const student of students.slice(2, 5)) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: student.id, courseId: dataScienceCourse.id } },
      update: {},
      create: {
        userId: student.id,
        courseId: dataScienceCourse.id,
        cohortId: cohort2026.id,
        assignedById: admin.id,
      },
    });
  }
  console.log(`  enrollments created for students`);

  // ── Community Groups ───────────────────────────────────────────────────

  const generalGroup = await prisma.communityGroup.upsert({
    where: { slug: "general" },
    update: {},
    create: {
      name: "General Discussion",
      slug: "general",
      description: "Open discussion for all members",
    },
  });

  const webDevGroup = await prisma.communityGroup.upsert({
    where: { slug: "web-dev-learners" },
    update: {},
    create: {
      name: "Web Dev Learners",
      slug: "web-dev-learners",
      description: "Study group for web development students",
      type: "COURSE",
      courseId: webDevCourse.id,
    },
  });

  // Add students to groups
  for (const student of students) {
    await prisma.groupMember.upsert({
      where: { userId_groupId: { userId: student.id, groupId: generalGroup.id } },
      update: {},
      create: { userId: student.id, groupId: generalGroup.id },
    });
  }

  for (const student of students.slice(0, 3)) {
    await prisma.groupMember.upsert({
      where: { userId_groupId: { userId: student.id, groupId: webDevGroup.id } },
      update: {},
      create: { userId: student.id, groupId: webDevGroup.id },
    });
  }
  console.log(`\n  groups      ${generalGroup.name}, ${webDevGroup.name}`);

  // ── Badge ──────────────────────────────────────────────────────────────

  await prisma.badge.upsert({
    where: { slug: "first-course" },
    update: {},
    create: {
      name: "First Course",
      slug: "first-course",
      description: "Enrolled in your first course",
      xpValue: 50,
    },
  });

  await prisma.badge.upsert({
    where: { slug: "course-completed" },
    update: {},
    create: {
      name: "Course Completed",
      slug: "course-completed",
      description: "Completed an entire course",
      xpValue: 200,
    },
  });

  await prisma.badge.upsert({
    where: { slug: "community-star" },
    update: {},
    create: {
      name: "Community Star",
      slug: "community-star",
      description: "Active contributor in community discussions",
      xpValue: 100,
    },
  });
  console.log(`  badges      first-course, course-completed, community-star`);

  console.log("\n Seeding complete!\n");
  console.log("  Demo Accounts:");
  console.log("  ─────────────────────────────────────────────────────────");
  console.log("  admin@novracademy.com       / admin1234      (Super Admin)");
  console.log("  org@novracademy.com         / org1234        (Org Admin)");
  console.log("  institution@novracademy.com / institution1234 (Institution Admin)");
  console.log("  manager@novracademy.com     / manager1234    (Manager)");
  console.log("  ada@novracademy.com         / student1234    (Learner)");
  console.log("  grace@novracademy.com       / student1234    (Learner)");
  console.log("  linus@novracademy.com       / student1234    (Learner)");
  console.log("  margaret@novracademy.com    / student1234    (Learner)");
  console.log("  tim@novracademy.com         / student1234    (Learner)");
  console.log("  ─────────────────────────────────────────────────────────\n");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
