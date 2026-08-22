import { OrganizationResolutionError } from "./domain.js";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: string): string {
  if (!isoDatePattern.test(value)) {
    throw new OrganizationResolutionError(
      "INVALID_EFFECTIVE_DATE",
      "Effective date must use YYYY-MM-DD format.",
      { effectiveDate: value },
    );
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new OrganizationResolutionError(
      "INVALID_EFFECTIVE_DATE",
      "Effective date is not a valid calendar date.",
      { effectiveDate: value },
    );
  }
  return value;
}

export function jakartaBusinessDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function effectiveDateOrToday(value?: string): string {
  return assertIsoDate(value ?? jakartaBusinessDate());
}

export function isEffective(
  effectiveFrom: string,
  effectiveTo: string | null,
  date: string,
): boolean {
  return effectiveFrom <= date && (effectiveTo === null || effectiveTo >= date);
}
