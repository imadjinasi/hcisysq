import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  assertManualAttendanceMutation,
  isIsoDate,
  jakartaToday,
  mapEmployeeRecord,
  registerAttendanceRoutes,
  resolveAttendanceRange,
  validateAttendanceTimes,
} from "../src/modules/attendance/routes.js";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://attendance-test",
  AUTH_ENCRYPTION_KEY: "11".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
};

function createAttendanceReadPool(principalType: "EMPLOYEE" | "SUPER_ADMIN") {
  const employeeId = "00000000-0000-4000-8000-000000000010";
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("FROM auth_sessions s")) {
      return {
        rows: [
          {
            sessionId: "00000000-0000-4000-8000-000000000100",
            accountId: "00000000-0000-4000-8000-000000000001",
            email: principalType === "EMPLOYEE" ? "employee@example.org" : "admin@example.org",
            principalType,
            expiresAt: new Date("2026-08-22T12:00:00.000Z"),
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("UPDATE auth_sessions SET last_seen_at")) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("FROM accounts a") && sql.includes("JOIN employees e")) {
      return {
        rows: [
          {
            id: employeeId,
            employeeNumber: "EMP-TEST-001",
            fullName: "Pegawai Test",
            status: "active",
            unitName: "Unit Test",
            positionName: "Posisi Test",
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM attendance_daily_records")) {
      expect(values?.[0]).toBe(employeeId);
      return {
        rows: [
          {
            employeeId,
            attendanceDate: "2026-08-21",
            checkInAt: new Date("2026-08-21T00:00:00.000Z"),
            checkOutAt: new Date("2026-08-21T09:00:00.000Z"),
            source: "manual",
            sourceReference: "internal-source-reference",
            note: "internal admin note",
            createdAt: new Date("2026-08-21T00:00:00.000Z"),
            updatedAt: new Date("2026-08-21T09:00:00.000Z"),
          },
        ],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected SQL in attendance test: ${sql}`);
  });

  return { pool: { query } as unknown as Pool, query, employeeId };
}

describe("ATT-001 attendance policy", () => {
  it("accepts only real ISO calendar dates", () => {
    expect(isIsoDate("2026-08-21")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("21-08-2026")).toBe(false);
  });

  it("uses Asia/Jakarta when resolving the reference date", () => {
    expect(jakartaToday(new Date("2026-08-21T17:30:00.000Z"))).toBe("2026-08-22");
  });

  it("defaults to a 30-day range ending on the reference date", () => {
    expect(resolveAttendanceRange({}, "2026-08-21")).toEqual({
      from: "2026-07-23",
      to: "2026-08-21",
    });
  });

  it("rejects reversed and over-sized ranges", () => {
    expect(() =>
      resolveAttendanceRange({ from: "2026-08-22", to: "2026-08-21" }, "2026-08-21"),
    ).toThrowError(expect.objectContaining({ code: "INVALID_ATTENDANCE_RANGE" }));

    expect(() =>
      resolveAttendanceRange({ from: "2026-06-01", to: "2026-08-21" }, "2026-08-21"),
    ).toThrowError(expect.objectContaining({ code: "ATTENDANCE_RANGE_TOO_LARGE" }));
  });

  it("allows a partial punch but rejects an empty record", () => {
    expect(() =>
      validateAttendanceTimes({
        checkInAt: "2026-08-21T07:00:00+07:00",
        checkOutAt: null,
      }),
    ).not.toThrow();

    expect(() => validateAttendanceTimes({ checkInAt: null, checkOutAt: null })).toThrowError(
      expect.objectContaining({ code: "ATTENDANCE_TIME_REQUIRED" }),
    );
  });

  it("rejects checkout before check-in while allowing overnight work", () => {
    expect(() =>
      validateAttendanceTimes({
        checkInAt: "2026-08-21T22:00:00+07:00",
        checkOutAt: "2026-08-22T06:00:00+07:00",
      }),
    ).not.toThrow();

    expect(() =>
      validateAttendanceTimes({
        checkInAt: "2026-08-21T08:00:00+07:00",
        checkOutAt: "2026-08-21T07:59:00+07:00",
      }),
    ).toThrowError(expect.objectContaining({ code: "ATTENDANCE_TIME_ORDER_INVALID" }));
  });

  it("omits admin note and source reference from employee records", () => {
    const employeeRecord = mapEmployeeRecord({
      employeeId: "00000000-0000-4000-8000-000000000010",
      attendanceDate: "2026-08-21",
      checkInAt: new Date("2026-08-21T00:00:00.000Z"),
      checkOutAt: new Date("2026-08-21T09:00:00.000Z"),
      source: "manual",
      sourceReference: "internal-source-reference",
      note: "internal admin note",
      createdAt: new Date("2026-08-21T00:00:00.000Z"),
      updatedAt: new Date("2026-08-21T00:00:00.000Z"),
    });

    expect(employeeRecord).not.toHaveProperty("sourceReference");
    expect(employeeRecord).not.toHaveProperty("note");
    expect(employeeRecord.source).toBe("manual");
  });

  it("keeps integration records immutable through manual correction routes", () => {
    expect(() => assertManualAttendanceMutation(undefined)).not.toThrow();
    expect(() => assertManualAttendanceMutation({ source: "manual" })).not.toThrow();
    expect(() => assertManualAttendanceMutation({ source: "integration" })).toThrowError(
      expect.objectContaining({ code: "INTEGRATED_ATTENDANCE_IMMUTABLE" }),
    );
  });
});

describe("ATT-001 employee route authorization and privacy", () => {
  it("reads attendance only through the employee linked to the authenticated account", async () => {
    const { pool, query, employeeId } = createAttendanceReadPool("EMPLOYEE");
    const app = Fastify({ logger: false });
    await registerAttendanceRoutes(app, pool, config);

    const response = await app.inject({
      method: "GET",
      url: "/attendance/me?from=2026-08-21&to=2026-08-21",
      headers: { cookie: "hcis_session=test-token" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.employee.id).toBe(employeeId);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).not.toHaveProperty("note");
    expect(body.items[0]).not.toHaveProperty("sourceReference");
    expect(
      query.mock.calls.some(
        ([sql]) => String(sql).includes("FROM attendance_daily_records"),
      ),
    ).toBe(true);

    await app.close();
  });

  it("rejects a Super Admin principal from the employee self-service endpoint", async () => {
    const { pool, query } = createAttendanceReadPool("SUPER_ADMIN");
    const app = Fastify({ logger: false });
    await registerAttendanceRoutes(app, pool, config);

    const response = await app.inject({
      method: "GET",
      url: "/attendance/me",
      headers: { cookie: "hcis_session=test-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(
      query.mock.calls.some(
        ([sql]) => String(sql).includes("FROM attendance_daily_records"),
      ),
    ).toBe(false);

    await app.close();
  });
});
