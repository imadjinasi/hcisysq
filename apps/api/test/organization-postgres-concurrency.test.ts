import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresOrganizationRepository } from "../src/modules/organization/repository.js";

const databaseUrl = process.env.HCIS_TEST_DATABASE_URL;
const integration = describe.runIf(Boolean(databaseUrl));
const schema = `org_concurrency_${randomUUID().replaceAll("-", "")}`;
let pool: Pool;

async function client(): Promise<PoolClient> {
  const connection = await pool.connect();
  await connection.query(`SET search_path TO ${schema}`);
  return connection;
}

integration("Organization PostgreSQL concurrency", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, max: 5 });
    const setup = await pool.connect();
    try {
      await setup.query(`CREATE SCHEMA ${schema}`);
      await setup.query(`SET search_path TO ${schema}`);
      await setup.query(`
        CREATE TABLE organization_change_sets (
          id uuid PRIMARY KEY, name text NOT NULL, effective_on date NOT NULL, status text NOT NULL,
          base_change_set_id uuid NULL, validation_report jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_by_account_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(), validated_at timestamptz NULL,
          published_at timestamptz NULL, validated_by_account_id uuid NULL, published_by_account_id uuid NULL
        );
        CREATE TABLE organization_nodes (
          id uuid PRIMARY KEY, change_set_id uuid NOT NULL, stable_key uuid NOT NULL, name text NOT NULL,
          node_type text NOT NULL, parent_node_key uuid NULL, active boolean NOT NULL,
          effective_from date NOT NULL, effective_to date NULL, visual_rank_offset integer NOT NULL,
          integration_code text NULL
        );
        CREATE TABLE organization_job_profiles (id uuid PRIMARY KEY, change_set_id uuid NOT NULL, stable_key uuid NOT NULL, name text NOT NULL, active boolean NOT NULL, effective_from date NOT NULL, effective_to date NULL);
        CREATE TABLE organization_positions (id uuid PRIMARY KEY, change_set_id uuid NOT NULL, stable_key uuid NOT NULL, node_key uuid NOT NULL, title text NOT NULL, parent_position_key uuid NULL, single_incumbent boolean NOT NULL, vacancy_policy text NOT NULL, active boolean NOT NULL, effective_from date NOT NULL, effective_to date NULL, visual_rank_offset integer NOT NULL, holder_source text NOT NULL DEFAULT 'EMPLOYEE');
        CREATE TABLE organization_memberships (id uuid PRIMARY KEY, change_set_id uuid NOT NULL, employee_id uuid NOT NULL, node_key uuid NOT NULL, job_profile_key uuid NULL, is_primary boolean NOT NULL, effective_from date NOT NULL, effective_to date NULL);
        CREATE TABLE organization_incumbencies (id uuid PRIMARY KEY, change_set_id uuid NOT NULL, position_key uuid NOT NULL, employee_id uuid NULL, account_id uuid NULL, kind text NOT NULL, effective_from date NOT NULL, effective_to date NULL, reason text NULL);
        CREATE TABLE organization_authority_bindings (id uuid PRIMARY KEY, change_set_id uuid NOT NULL, subject_kind text NOT NULL, subject_key uuid NOT NULL, binding_type text NOT NULL, target_position_key uuid NOT NULL, vacancy_policy text NOT NULL, effective_from date NOT NULL, effective_to date NULL);
        CREATE TABLE organization_reporting_overrides (id uuid PRIMARY KEY, change_set_id uuid NOT NULL, employee_id uuid NOT NULL, manager_position_key uuid NULL, manager_employee_id uuid NULL, reason text NOT NULL, effective_from date NOT NULL, effective_to date NULL, created_by_account_id uuid NOT NULL);
        CREATE TABLE organization_audit_events (id uuid PRIMARY KEY, action text NOT NULL, change_set_id uuid NULL);
      `);
    } finally {
      setup.release();
    }
  });

  afterAll(async () => {
    if (!pool) return;
    const cleanup = await pool.connect();
    try { await cleanup.query(`DROP SCHEMA ${schema} CASCADE`); }
    finally { cleanup.release(); await pool.end(); }
  });

  it("makes the second overlapping mutation wait and then read the first committed snapshot", async () => {
    const changeSetId = randomUUID();
    const actorId = randomUUID();
    const seed = await client();
    await seed.query(
      `INSERT INTO organization_change_sets (id,name,effective_on,status,created_by_account_id)
       VALUES ($1,'Concurrent draft','2026-08-23','DRAFT',$2)`,
      [changeSetId, actorId],
    );
    seed.release();

    const first = await client();
    const second = await client();
    await first.query("BEGIN");
    await second.query("BEGIN");
    const firstRepository = new PostgresOrganizationRepository(first);
    const secondRepository = new PostgresOrganizationRepository(second);
    const snapshotA = await firstRepository.loadEditableSnapshotForUpdate(changeSetId);
    expect(snapshotA).not.toBeNull();

    let secondLoaded = false;
    const snapshotBPromise = secondRepository.loadEditableSnapshotForUpdate(changeSetId)
      .then((snapshot) => { secondLoaded = true; return snapshot; });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(secondLoaded).toBe(false);

    snapshotA!.nodes.push({
      id: randomUUID(), stableKey: randomUUID(), name: "Mutation A", nodeType: "UNIT",
      parentNodeKey: null, active: true, effectiveFrom: "2026-08-23", effectiveTo: null,
      visualRankOffset: 0, integrationCode: null,
    });
    await firstRepository.replaceDraftSnapshot(snapshotA!);
    await first.query("INSERT INTO organization_audit_events (id,action,change_set_id) VALUES ($1,'A',$2)", [randomUUID(), changeSetId]);
    await first.query("COMMIT");
    first.release();

    const snapshotB = await snapshotBPromise;
    expect(snapshotB?.nodes.map((item) => item.name)).toContain("Mutation A");
    snapshotB!.nodes.push({
      id: randomUUID(), stableKey: randomUUID(), name: "Mutation B", nodeType: "UNIT",
      parentNodeKey: null, active: true, effectiveFrom: "2026-08-23", effectiveTo: null,
      visualRankOffset: 0, integrationCode: null,
    });
    await secondRepository.replaceDraftSnapshot(snapshotB!);
    await second.query("INSERT INTO organization_audit_events (id,action,change_set_id) VALUES ($1,'B',$2)", [randomUUID(), changeSetId]);
    await second.query("COMMIT");
    second.release();

    const verify = await client();
    const final = await new PostgresOrganizationRepository(verify).loadChangeSetSnapshot(changeSetId);
    const audits = await verify.query("SELECT action FROM organization_audit_events WHERE change_set_id = $1", [changeSetId]);
    verify.release();
    expect(final?.nodes.map((item) => item.name).sort()).toEqual(["Mutation A", "Mutation B"]);
    expect(audits.rows).toHaveLength(2);
  }, 10_000);

  it("resolves the newest same-day published revision deterministically", async () => {
    const actorId = randomUUID();
    const revisionA = randomUUID();
    const revisionB = randomUUID();
    const connection = await client();
    await connection.query(
      `INSERT INTO organization_change_sets
        (id,name,effective_on,status,base_change_set_id,created_by_account_id,validated_at,published_at,created_at)
       VALUES
        ($1,'Revision A','2026-08-23','PUBLISHED',NULL,$3,now(),'2026-08-23T01:00:00Z','2026-08-23T00:00:00Z'),
        ($2,'Revision B','2026-08-23','PUBLISHED',$1,$3,now(),'2026-08-23T02:00:00Z','2026-08-23T01:30:00Z')`,
      [revisionA, revisionB, actorId],
    );
    const effective = await new PostgresOrganizationRepository(connection).loadEffectiveSnapshot("2026-08-23");
    const old = await new PostgresOrganizationRepository(connection).loadChangeSetSnapshot(revisionA);
    const laterDraft = await new PostgresOrganizationRepository(connection).createDraft({
      name: "Revision C", effectiveOn: "2026-08-23", actorAccountId: actorId,
    });
    connection.release();

    expect(effective?.changeSet.id).toBe(revisionB);
    expect(effective?.changeSet.baseChangeSetId).toBe(revisionA);
    expect(old?.changeSet.status).toBe("PUBLISHED");
    expect(laterDraft.changeSet.baseChangeSetId).toBe(revisionB);
  });
});
