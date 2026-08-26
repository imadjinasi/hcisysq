import { z } from "zod";

export const employeeMasterEditSchema = z.object({
  fullName: z.string().trim().min(1),
  employeeNumber: z.string().trim().min(1),
  status: z.enum(["active", "inactive", "resigned"]),
  employmentStatus: z.string().trim().nullable(),
  organizationalUnitId: z.string().uuid().nullable(),
  positionId: z.string().uuid().nullable(),
  employmentType: z.string().trim().nullable(),
  functionalPosition: z.string().trim().nullable(),
  structuralPosition: z.string().trim().nullable(),
  email: z.string().trim().email().nullable(),
  phone: z.string().trim().max(50).nullable(),
  education: z.string().trim().nullable(),
  startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  endedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  reason: z.string().trim().min(1).max(500),
});

export function employeeMasterValidationFields(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join(".")).filter(Boolean))];
}
