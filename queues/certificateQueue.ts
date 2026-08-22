import * as alumniService from "../services/alumniService";
import * as certificateService from "../services/certificateService";

export async function enqueueCertificateGeneration(enrollmentId: string) {
  try {
    await certificateService.issueCertificateForEnrollment(enrollmentId);
  } catch (err) {
    console.error("Failed to generate certificate for enrollment", enrollmentId, err);
  }
}

export async function enqueueLegacyCertificateGeneration(alumniRecordId: string) {
  try {
    await alumniService.generateLegacyCertificatePdf(alumniRecordId);
  } catch (err) {
    console.error("Failed to generate legacy certificate", alumniRecordId, err);
  }
}
