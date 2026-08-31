import ExcelJS from "exceljs";
import { prisma } from "@novr/db";

export const ITF_CATEGORIES = [
  "MANAGEMENT",
  "SUPERVISORY",
  "OPERATIVE",
  "LD_PERSONNEL",
  "HSE",
  "SIWES",
] as const;

export type ItfCategory = (typeof ITF_CATEGORIES)[number];

export interface ItfEstimate {
  estimatedAmountNgn: number;
}

/**
 * Per-category hourly reimbursement rates (NGN per trainee-hour). These are
 * configurable via ITF_CATEGORY_RATES (comma-separated `CATEGORY:rate` pairs)
 * so they can be aligned with the current ITF schedule without a redeploy.
 * Defaults mirror the commonly used banded ITF rates.
 */
const DEFAULT_CATEGORY_RATES: Record<string, number> = {
  MANAGEMENT: 2500,
  SUPERVISORY: 1800,
  OPERATIVE: 1200,
  LD_PERSONNEL: 900,
  HSE: 1600,
  SIWES: 700,
};

function loadCategoryRates(): Record<string, number> {
  const raw = process.env.ITF_CATEGORY_RATES;
  if (!raw) return DEFAULT_CATEGORY_RATES;
  const rates: Record<string, number> = {};
  for (const pair of raw.split(",")) {
    const [cat, rate] = pair.split(":").map((s) => s.trim());
    if (cat && rate && !Number.isNaN(Number(rate))) rates[cat.toUpperCase()] = Number(rate);
  }
  return { ...DEFAULT_CATEGORY_RATES, ...rates };
}

export function computeItfEstimate(
  categories: { category: string; trainees: number; hours: number }[],
  headcount: number | null
): ItfEstimate {
  const rates = loadCategoryRates();
  let estimatedAmountNgn = 0;
  for (const c of categories) {
    const rate = rates[c.category.toUpperCase()] ?? DEFAULT_CATEGORY_RATES.OPERATIVE;
    estimatedAmountNgn += Math.round(c.trainees * c.hours * rate);
  }
  return { estimatedAmountNgn };
}

export interface ItfPreviewData {
  year: number;
  orgName: string;
  orgRcNumber: string | null;
  orgItfRegNumber: string | null;
  industrySector: string | null;
  totalTrainees: number;
  totalHours: number;
  totalCostNgn: number;
  courses: {
    courseId: string;
    title: string;
    category: string;
    enrolled: number;
    completed: number;
    hours: number;
    costNgn: number;
  }[];
  categories: { category: string; trainees: number; hours: number }[];
  warnings: string[];
  estimate: {
    estimatedAmountNgn: number;
    pctTrained: number;
    awardPct: number;
    perCategory: { category: string; trainees: number; hours: number; pctTrained: number; awardPct: number; reclaimEstimate: number }[];
  };
}

async function getEnrollmentsForYear(organizationId: string | null, trainingYear: number) {
  const yearStart = new Date(trainingYear, 0, 1);
  const yearEnd = new Date(trainingYear, 11, 31, 23, 59, 59);

  return prisma.enrollment.findMany({
    where: {
      user: { organizationId },
      OR: [
        { enrolledAt: { gte: yearStart, lte: yearEnd } },
        { completedAt: { gte: yearStart, lte: yearEnd } },
      ],
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      course: {
        include: {
          lessons: { select: { durationSeconds: true } },
          createdBy: { select: { name: true } },
        },
      },
      payment: { select: { providerRef: true, status: true, amountCents: true } },
      certificate: { select: { certUid: true, issuedAt: true } },
    },
    orderBy: { enrolledAt: "asc" },
  });
}

function computeCourseHours(course: { itfContactHours: number | null; lessons: { durationSeconds: number | null }[] }): number {
  if (course.itfContactHours != null) return course.itfContactHours;
  const totalSeconds = course.lessons.reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0);
  return totalSeconds / 3600;
}

export async function getItfPreview(organizationId: string | null, trainingYear: number): Promise<ItfPreviewData> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId! } });
  const enrollments = await getEnrollmentsForYear(organizationId, trainingYear);

  const warnings: string[] = [];
  if (enrollments.length === 0) {
    warnings.push("No training records found for this year");
  }

  const courseMap = new Map<string, {
    title: string;
    category: string;
    enrolled: number;
    completed: number;
    hours: number;
    costNgn: number;
  }>();

  const catMap = new Map<string, { trainees: Set<string>; hours: number }>();

  for (const e of enrollments) {
    const key = e.courseId;
    if (!courseMap.has(key)) {
      const hrs = computeCourseHours(e.course);
      const cat = e.course.category || "Uncategorized";
      courseMap.set(key, {
        title: e.course.title,
        category: cat,
        enrolled: 0,
        completed: 0,
        hours: hrs,
        costNgn: Math.round((e.course.priceCents / 100) * 100) / 100,
      });
      if (!catMap.has(cat)) catMap.set(cat, { trainees: new Set(), hours: 0 });
    }

    const c = courseMap.get(key)!;
    c.enrolled += 1;
    if (e.status === "ACTIVE" || e.completedAt) c.completed += 1;

    const cat = e.course.category || "Uncategorized";
    catMap.get(cat)!.trainees.add(e.userId);
    catMap.get(cat)!.hours += c.hours;

    if (!e.completedAt) warnings.push(`${e.user.name} has not completed ${e.course.title}`);
    if (!e.certificate) warnings.push(`${e.user.name} has no certificate for ${e.course.title}`);
    if (!e.payment || e.payment.status !== "SUCCEEDED") warnings.push(`No successful payment for ${e.user.name} → ${e.course.title}`);
    if (!e.course.category || e.course.category === "") warnings.push(`${e.course.title} has no ITF category`);
  }

  const courses = Array.from(courseMap.entries()).map(([id, data]) => ({ courseId: id, ...data }));
  const categories = Array.from(catMap.entries()).map(([category, d]) => ({
    category,
    trainees: d.trainees.size,
    hours: Math.round(d.hours * 100) / 100,
  }));

  const uniqueTrainees = new Set(enrollments.map((e) => e.userId)).size;
  const totalHours = courses.reduce((sum, c) => sum + c.hours * c.enrolled, 0);
  const totalCostNgn = enrollments.reduce((sum, e) => sum + Math.round(e.course.priceCents / 100), 0);

  // Build the per-category award roll-up + overall estimate the UI shows.
  const perCategory = categories.map((c) => {
    const headcount = org?.itfEmployeeHeadcount ?? 0;
    const pctTrained = headcount > 0 ? Math.min(100, Math.round((c.trainees / headcount) * 100)) : 0;
    // Standard ITF award bands by % trained (roughly mirrors the TR-2A scheme).
    const awardPct = pctTrained >= 90 ? 100 : pctTrained >= 70 ? 80 : pctTrained >= 50 ? 60 : pctTrained >= 30 ? 40 : pctTrained > 0 ? 20 : 0;
    const rates = loadCategoryRates();
    const rate = rates[c.category.toUpperCase()] ?? DEFAULT_CATEGORY_RATES.OPERATIVE;
    const reclaimEstimate = Math.round(c.trainees * c.hours * rate * (awardPct / 100));
    return { ...c, pctTrained, awardPct, reclaimEstimate };
  });

  const estimate = computeItfEstimate(categories, org?.itfEmployeeHeadcount ?? null);
  const overallTrainedPct =
    org?.itfEmployeeHeadcount && org.itfEmployeeHeadcount > 0
      ? Math.min(100, Math.round((uniqueTrainees / org.itfEmployeeHeadcount) * 100))
      : 0;
  const overallAwardPct =
    overallTrainedPct >= 90 ? 100 : overallTrainedPct >= 70 ? 80 : overallTrainedPct >= 50 ? 60 : overallTrainedPct >= 30 ? 40 : overallTrainedPct > 0 ? 20 : 0;

  return {
    year: trainingYear,
    orgName: org?.name ?? "Unknown",
    orgRcNumber: org?.itfRcNumber ?? null,
    orgItfRegNumber: org?.itfRegistrationNumber ?? null,
    industrySector: org?.itfIndustrySector ?? null,
    totalTrainees: uniqueTrainees,
    totalHours: Math.round(totalHours * 100) / 100,
    totalCostNgn,
    courses,
    categories,
    warnings,
    estimate: {
      estimatedAmountNgn: estimate.estimatedAmountNgn,
      pctTrained: overallTrainedPct,
      awardPct: overallAwardPct,
      perCategory,
    },
  };
}

export async function generateItfExport(organizationId: string | null, trainingYear: number): Promise<Buffer> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId! } });
  const enrollments = await getEnrollmentsForYear(organizationId, trainingYear);
  const preview = await getItfPreview(organizationId, trainingYear);

  const wb = new ExcelJS.Workbook();
  wb.creator = "NovrACADEMY";

  // ── Cover Sheet ──────────────────────────────────────────────────────
  const cover = wb.addWorksheet("Cover", { properties: { tabColor: { argb: "4451A2" } } });
  cover.getColumn(1).width = 35;
  cover.getColumn(2).width = 50;

  const addCoverRow = (label: string, value: string | number | null | undefined, bold = false) => {
    const row = cover.addRow([label, value ?? ""]);
    if (bold) row.font = { bold: true };
    row.getCell(1).font = { bold: true, color: { argb: "1A1A2E" } };
    return row;
  };

  addCoverRow("ITF RECLAIM EXPORT", "", true);
  cover.addRow([]);
  addCoverRow("Company Name", org?.name);
  addCoverRow("RC Number", org?.itfRcNumber);
  addCoverRow("ITF Registration Number", org?.itfRegistrationNumber);
  addCoverRow("Industry Sector", org?.itfIndustrySector);
  addCoverRow("Annual Payroll Band", org?.itfAnnualPayrollBand);
  addCoverRow("Total Headcount", org?.itfEmployeeHeadcount);
  addCoverRow("Contact Phone", org?.itfContactPhone);
  addCoverRow("Contact Email", org?.itfContactEmail);
  addCoverRow("Contact Address", org?.itfContactAddress);
  cover.addRow([]);
  addCoverRow("Training Year", trainingYear, true);
  addCoverRow("Total Unique Trainees", preview.totalTrainees);
  addCoverRow("Total Training Hours", preview.totalHours);
  addCoverRow("Total Cost (₦)", `₦${preview.totalCostNgn.toLocaleString()}`);
  addCoverRow("Generated", new Date().toISOString());
  cover.addRow([]);

  if (preview.warnings.length > 0) {
    addCoverRow(`Data Warnings (${preview.warnings.length})`, "", true);
    for (const w of preview.warnings.slice(0, 30)) {
      addCoverRow("  ⚠", w);
    }
  }

  // ── TR-1A Sheet (per-trainee rows) ──────────────────────────────────
  const tr1a = wb.addWorksheet("TR-1A", { properties: { tabColor: { argb: "683290" } } });
  const tr1aHeaders = [
    "S/No", "Trainee Name", "Employee ID", "Email",
    "ITF Category", "Course Title", "Course Synopsis",
    "Trainer / Provider", "Delivery Mode", "Venue",
    "Date From", "Date To", "Duration (hrs)",
    "Fee (₦)", "Receipt Ref", "Certificate", "Cert Ref",
  ];
  tr1a.addRow(tr1aHeaders);
  tr1a.getRow(1).font = { bold: true };
  tr1a.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F4ECF8" } };

  enrollments.forEach((e, idx) => {
    const hrs = computeCourseHours(e.course);
    const fee = Math.round(e.course.priceCents / 100);
    const hasCert = !!e.certificate;
    const hasReceipt = e.payment?.status === "SUCCEEDED";
    const mode = e.course.itfDeliveryMode ?? "ONLINE";
    const synopsis = (e.course.description ?? "").slice(0, 200);
    const provider = e.course.itfFacilitator ?? "NovrACADEMY";

    tr1a.addRow([
      idx + 1,
      e.user.name ?? e.user.email,
      e.user.id,
      e.user.email,
      e.course.category || "Uncategorized",
      e.course.title,
      synopsis,
      provider,
      mode,
      mode === "ONLINE" ? "Virtual" : "See Form 4A",
      e.enrolledAt.toISOString().split("T")[0],
      (e.completedAt ?? e.enrolledAt).toISOString().split("T")[0],
      Math.round(hrs * 100) / 100,
      fee,
      hasReceipt ? e.payment!.providerRef : "N/A",
      hasCert ? "Yes" : "No",
      hasCert ? e.certificate!.certUid : "",
    ]);
  });

  // ── TR-2A Sheet (award roll-up by category) ─────────────────────────
  const tr2a = wb.addWorksheet("TR-2A", { properties: { tabColor: { argb: "4451A2" } } });
  const tr2aHeaders = [
    "Category", "Trainees Trained", "Total Hours", "Total Cost (₦)",
    "% of Claimable", "Award % (est.)", "Estimated Reclaim (₦)",
  ];
  tr2a.addRow(tr2aHeaders);
  tr2a.getRow(1).font = { bold: true };
  tr2a.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F4ECF8" } };

  for (const cat of preview.categories) {
    const headcount = org?.itfEmployeeHeadcount ?? cat.trainees;
    const pctTrained = headcount > 0 ? Math.round((cat.trainees / headcount) * 10000) / 100 : 0;
    // Award % estimate based on ITF 8th schedule
    let awardPct = 0;
    if (pctTrained >= 40) awardPct = 15;
    else if (pctTrained >= 25) awardPct = 11;
    else if (pctTrained > 0) awardPct = 5;

    const reclaimEstimate = Math.round((cat.hours * 500) * awardPct / 100); // rough ₦500/hr

    tr2a.addRow([
      cat.category,
      cat.trainees,
      cat.hours,
      `₦${cat.hours.toLocaleString()}`,
      `${pctTrained}%`,
      `${awardPct}%`,
      `₦${reclaimEstimate.toLocaleString()}`,
    ]);
  }

  // ── Buffer ──────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
