import { createHash, randomUUID } from "node:crypto";

import Fastify from "fastify";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { registerEmployeeLeaveRoutes } from "../src/modules/leave/employee-routes.js";

const databaseUrl = process.env.HCIS_TEST_DATABASE_URL;
const integration = describe.runIf(Boolean(databaseUrl));
const ids = Object.fromEntries([
  "unit", "legacyPosition", "changeSet", "rootNode", "normalNode", "invitedNode", "vacancyNode",
  "directorPosition", "managerPosition", "unitPosition", "invitedPosition", "vacantPosition",
  "requester", "invitedRequester", "vacancyRequester", "manager", "unitApprover", "director", "invitedApprover",
  "requesterAccount", "invitedRequesterAccount", "vacancyRequesterAccount", "managerAccount",
  "unitAccount", "directorAccount", "invitedAccount",
].map((key) => [key, randomUUID()])) as Record<string, string>;
const suffix = ids.changeSet.slice(0, 8);

const tokens = {
  requester: `synthetic-requester-session-${suffix}`,
  invitedRequester: `synthetic-invited-requester-session-${suffix}`,
  vacancyRequester: `synthetic-vacancy-requester-session-${suffix}`,
  manager: `synthetic-manager-session-${suffix}`,
  unit: `synthetic-unit-session-${suffix}`,
  director: `synthetic-director-session-${suffix}`,
};
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
let pool: Pool;

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: databaseUrl ?? "postgres://unused",
  AUTH_ENCRYPTION_KEY: "11".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
};

async function app() {
  const instance = Fastify({ logger: false });
  await registerEmployeeLeaveRoutes(instance, pool, config);
  return instance;
}

async function submit(token: string, idempotencyKey: string) {
  const instance = await app();
  const response = await instance.inject({
    method: "POST",
    url: "/leave/me/annual/submit",
    headers: { cookie: `hcis_session=${token}` },
    payload: {
      startOn: "2026-09-07",
      endOn: "2026-09-07",
      reason: "Synthetic disposable PostgreSQL UAT",
      idempotencyKey,
    },
  });
  await instance.close();
  return response;
}

async function approve(token: string, stepId: string) {
  const instance = await app();
  const response = await instance.inject({
    method: "POST",
    url: `/leave/approvals/${stepId}/decision`,
    headers: { cookie: `hcis_session=${token}` },
    payload: { decision: "approve", note: "Synthetic UAT decision" },
  });
  await instance.close();
  return response;
}

integration("ORG-007 disposable PostgreSQL Leave UAT", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    await pool.query("BEGIN");
    try {
      await pool.query(`INSERT INTO organizational_units (id, normalized_name, name)
        VALUES ($1,$2,'Synthetic ORG-007')`, [ids.unit, `synthetic-org007-${suffix}`]);
      await pool.query(`INSERT INTO positions (id, normalized_name, name)
        VALUES ($1,$2,'Synthetic Position')`, [ids.legacyPosition, `synthetic-position-org007-${suffix}`]);
      const employees = [
        [ids.requester, `SYN-${suffix}-001`, "Synthetic Requester"],
        [ids.invitedRequester, `SYN-${suffix}-002`, "Synthetic Invited Case Requester"],
        [ids.vacancyRequester, `SYN-${suffix}-003`, "Synthetic Vacancy Requester"],
        [ids.manager, `SYN-${suffix}-004`, "Synthetic Direct Manager"],
        [ids.unitApprover, `SYN-${suffix}-005`, "Synthetic Unit Approver"],
        [ids.director, `SYN-${suffix}-006`, "Synthetic Director"],
        [ids.invitedApprover, `SYN-${suffix}-007`, "Synthetic Invited Approver"],
      ];
      for (const [id, number, name] of employees) {
        await pool.query(`INSERT INTO employees (
          id, employee_number, full_name, status, organizational_unit_id, position_id,
          started_on, leave_entitlement_group
        ) VALUES ($1,$2,$3,'active',$4,$5,'2024-01-01','non_education')`,
        [id, number, name, ids.unit, ids.legacyPosition]);
      }

      const accounts = [
        [ids.requesterAccount, ids.requester, `requester-${suffix}@example.test`, "active"],
        [ids.invitedRequesterAccount, ids.invitedRequester, `invited-requester-${suffix}@example.test`, "active"],
        [ids.vacancyRequesterAccount, ids.vacancyRequester, `vacancy-requester-${suffix}@example.test`, "active"],
        [ids.managerAccount, ids.manager, `manager-${suffix}@example.test`, "active"],
        [ids.unitAccount, ids.unitApprover, `unit-${suffix}@example.test`, "active"],
        [ids.directorAccount, ids.director, `director-${suffix}@example.test`, "active"],
        [ids.invitedAccount, ids.invitedApprover, `invited-${suffix}@example.test`, "invited"],
      ];
      for (const [id, employeeId, email, status] of accounts) {
        await pool.query(`INSERT INTO accounts (id,employee_id,email,principal_type,status)
          VALUES ($1,$2,$3,'EMPLOYEE',$4)`, [id, employeeId, email, status]);
      }
      const sessions = [
        [ids.requesterAccount, tokens.requester],
        [ids.invitedRequesterAccount, tokens.invitedRequester],
        [ids.vacancyRequesterAccount, tokens.vacancyRequester],
        [ids.managerAccount, tokens.manager],
        [ids.unitAccount, tokens.unit],
        [ids.directorAccount, tokens.director],
      ];
      for (const [accountId, token] of sessions) {
        await pool.query(`INSERT INTO auth_sessions (id,account_id,token_hash,expires_at)
          VALUES ($1,$2,$3,now()+interval '1 day')`, [randomUUID(), accountId, tokenHash(token)]);
      }
      await pool.query(`UPDATE leave_calendar_settings SET working_weekday_mask=31 WHERE singleton=true`);
      await pool.query(`INSERT INTO organization_change_sets (
        id,name,effective_on,status,validation_report,created_by_account_id,
        validated_by_account_id,published_by_account_id,validated_at,published_at
      ) VALUES ($1,'Synthetic ORG-007','2026-01-01','PUBLISHED','{"valid":true}'::jsonb,$2,$2,$2,now(),now())`,
      [ids.changeSet, ids.requesterAccount]);
      const nodes = [[ids.rootNode, "Synthetic Root", null], [ids.normalNode, "Synthetic Normal", ids.rootNode],
        [ids.invitedNode, "Synthetic Invited", ids.rootNode], [ids.vacancyNode, "Synthetic Vacancy", ids.rootNode]];
      for (const [stableKey, name, parent] of nodes) {
        await pool.query(`INSERT INTO organization_nodes (
          id,change_set_id,stable_key,name,node_type,parent_node_key,effective_from
        ) VALUES ($1,$2,$3,$4,'TEAM',$5,'2026-01-01')`,
        [randomUUID(), ids.changeSet, stableKey, name, parent]);
      }
      const positions = [
        [ids.directorPosition, ids.rootNode, "Director", null],
        [ids.managerPosition, ids.normalNode, "Direct Manager", ids.directorPosition],
        [ids.unitPosition, ids.normalNode, "Unit Approver", ids.directorPosition],
        [ids.invitedPosition, ids.invitedNode, "Invited Authority", ids.directorPosition],
        [ids.vacantPosition, ids.vacancyNode, "Vacant Operational Authority", ids.directorPosition],
      ];
      for (const [stableKey, nodeKey, title, parent] of positions) {
        await pool.query(`INSERT INTO organization_positions (
          id,change_set_id,stable_key,node_key,title,parent_position_key,effective_from
        ) VALUES ($1,$2,$3,$4,$5,$6,'2026-01-01')`,
        [randomUUID(), ids.changeSet, stableKey, nodeKey, title, parent]);
      }
      const incumbencies = [[ids.directorPosition, ids.director], [ids.managerPosition, ids.manager],
        [ids.unitPosition, ids.unitApprover], [ids.invitedPosition, ids.invitedApprover]];
      for (const [positionKey, employeeId] of incumbencies) {
        await pool.query(`INSERT INTO organization_incumbencies (
          id,change_set_id,position_key,employee_id,kind,effective_from,is_primary_structural
        ) VALUES ($1,$2,$3,$4,'PRIMARY','2026-01-01',true)`,
        [randomUUID(), ids.changeSet, positionKey, employeeId]);
      }
      const memberships = [[ids.requester, ids.normalNode], [ids.invitedRequester, ids.invitedNode],
        [ids.vacancyRequester, ids.vacancyNode]];
      for (const [employeeId, nodeKey] of memberships) {
        await pool.query(`INSERT INTO organization_memberships (
          id,change_set_id,employee_id,node_key,is_primary,effective_from
        ) VALUES ($1,$2,$3,$4,true,'2026-01-01')`,
        [randomUUID(), ids.changeSet, employeeId, nodeKey]);
      }
      const bindings = [
        [ids.normalNode, "LEADER", ids.managerPosition, "CLIMB_TO_PARENT"], [ids.normalNode, "UNIT_APPROVER", ids.unitPosition, "CLIMB_TO_PARENT"],
        [ids.invitedNode, "LEADER", ids.invitedPosition, "BLOCK"], [ids.invitedNode, "UNIT_APPROVER", ids.unitPosition, "CLIMB_TO_PARENT"],
        [ids.vacancyNode, "LEADER", ids.vacantPosition, "CLIMB_TO_PARENT"], [ids.vacancyNode, "UNIT_APPROVER", ids.vacantPosition, "CLIMB_TO_PARENT"],
      ];
      for (const [subjectKey, type, target, policy] of bindings) {
        await pool.query(`INSERT INTO organization_authority_bindings (
          id,change_set_id,subject_kind,subject_key,binding_type,target_position_key,vacancy_policy,effective_from
        ) VALUES ($1,$2,'NODE',$3,$4,$5,$6,'2026-01-01')`,
        [randomUUID(), ids.changeSet, subjectKey, type, target, policy]);
      }
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it("submits, snapshots two authorities, and reaches final approved through real routes", async () => {
    const response = await submit(tokens.requester, randomUUID());
    expect(response.statusCode, response.body).toBe(201);
    const body = response.json<{ id: string; approvalChain: Array<{ id: string; employeeId: string }> }>();
    expect(body.approvalChain.map((item) => item.employeeId)).toEqual([ids.manager, ids.unitApprover]);
    const snapshot = await pool.query(`SELECT validation_summary, status FROM leave_requests WHERE id=$1`, [body.id]);
    expect(snapshot.rows[0].validation_summary.authorityResolution).toMatchObject({
      authoritativeSource: "STRUCTURE",
    });
    expect(await approve(tokens.manager, body.approvalChain[0]!.id)).toMatchObject({ statusCode: 200 });
    expect(await approve(tokens.unit, body.approvalChain[1]!.id)).toMatchObject({ statusCode: 200 });
    const final = await pool.query(`SELECT status FROM leave_requests WHERE id=$1`, [body.id]);
    expect(final.rows[0].status).toBe("approved");
  });

  it("fails closed before creating a request when the structural approver is invited", async () => {
    const key = randomUUID();
    const response = await submit(tokens.invitedRequester, key);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "AUTHORITY_INELIGIBLE" });
    const created = await pool.query(`SELECT count(*)::int AS count FROM leave_requests
      WHERE employee_id=$1 AND idempotency_key=$2`, [ids.invitedRequester, key]);
    expect(created.rows[0].count).toBe(0);
  });

  it("snapshots vacancy climb to Director once with both semantic sources", async () => {
    const response = await submit(tokens.vacancyRequester, randomUUID());
    expect(response.statusCode, response.body).toBe(201);
    const body = response.json<{ id: string; approvalChain: Array<{ id: string; employeeId: string }> }>();
    expect(body.approvalChain.map((item) => item.employeeId)).toEqual([ids.director]);
    const steps = await pool.query(`SELECT approver_employee_id, sources FROM leave_request_approval_steps
      WHERE leave_request_id=$1 ORDER BY step_order`, [body.id]);
    expect(steps.rows).toEqual([{ approver_employee_id: ids.director,
      sources: ["DIRECT_MANAGER", "UNIT_APPROVER"] }]);
  });
});
