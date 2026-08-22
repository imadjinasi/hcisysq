-- ORG-004 dynamic organization foundation.
-- This migration is additive. It neither copies/invents employee relationships nor
-- activates structural authority: absence of a rollout row means LEGACY mode.

CREATE TABLE IF NOT EXISTS organization_change_sets (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  effective_on date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'VALIDATED', 'PUBLISHED')),
  base_change_set_id uuid NULL REFERENCES organization_change_sets(id) ON DELETE RESTRICT,
  validation_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  validated_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  published_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz NULL,
  published_at timestamptz NULL,
  CHECK (
    (status = 'DRAFT' AND validated_at IS NULL AND published_at IS NULL)
    OR (status = 'VALIDATED' AND validated_at IS NOT NULL AND published_at IS NULL)
    OR (status = 'PUBLISHED' AND validated_at IS NOT NULL AND published_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_change_sets_one_published_date_idx
  ON organization_change_sets (effective_on)
  WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS organization_change_sets_effective_idx
  ON organization_change_sets (status, effective_on DESC);

CREATE TABLE IF NOT EXISTS organization_nodes (
  id uuid PRIMARY KEY,
  change_set_id uuid NOT NULL REFERENCES organization_change_sets(id) ON DELETE CASCADE,
  stable_key uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  node_type text NOT NULL CHECK (length(btrim(node_type)) > 0),
  parent_node_key uuid NULL,
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_to date NULL,
  visual_rank_offset integer NOT NULL DEFAULT 0 CHECK (visual_rank_offset >= 0),
  integration_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (change_set_id, stable_key),
  UNIQUE (change_set_id, integration_code),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (parent_node_key IS NULL OR parent_node_key <> stable_key),
  FOREIGN KEY (change_set_id, parent_node_key)
    REFERENCES organization_nodes(change_set_id, stable_key)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS organization_nodes_parent_idx
  ON organization_nodes (change_set_id, parent_node_key);

CREATE TABLE IF NOT EXISTS organization_job_profiles (
  id uuid PRIMARY KEY,
  change_set_id uuid NOT NULL REFERENCES organization_change_sets(id) ON DELETE CASCADE,
  stable_key uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_to date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (change_set_id, stable_key),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS organization_positions (
  id uuid PRIMARY KEY,
  change_set_id uuid NOT NULL REFERENCES organization_change_sets(id) ON DELETE CASCADE,
  stable_key uuid NOT NULL,
  node_key uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  parent_position_key uuid NULL,
  single_incumbent boolean NOT NULL DEFAULT true,
  vacancy_policy text NOT NULL DEFAULT 'CLIMB_TO_PARENT'
    CHECK (vacancy_policy IN ('CLIMB_TO_PARENT', 'REQUIRE_ACTING_OR_BLOCK', 'BLOCK')),
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_to date NULL,
  visual_rank_offset integer NOT NULL DEFAULT 0 CHECK (visual_rank_offset >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (change_set_id, stable_key),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (parent_position_key IS NULL OR parent_position_key <> stable_key),
  FOREIGN KEY (change_set_id, node_key)
    REFERENCES organization_nodes(change_set_id, stable_key)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (change_set_id, parent_position_key)
    REFERENCES organization_positions(change_set_id, stable_key)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS organization_positions_node_idx
  ON organization_positions (change_set_id, node_key);

CREATE INDEX IF NOT EXISTS organization_positions_parent_idx
  ON organization_positions (change_set_id, parent_position_key);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id uuid PRIMARY KEY,
  change_set_id uuid NOT NULL REFERENCES organization_change_sets(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  node_key uuid NOT NULL,
  job_profile_key uuid NULL,
  is_primary boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_to date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  FOREIGN KEY (change_set_id, node_key)
    REFERENCES organization_nodes(change_set_id, stable_key)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (change_set_id, job_profile_key)
    REFERENCES organization_job_profiles(change_set_id, stable_key)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS organization_memberships_employee_idx
  ON organization_memberships (change_set_id, employee_id, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS organization_incumbencies (
  id uuid PRIMARY KEY,
  change_set_id uuid NOT NULL REFERENCES organization_change_sets(id) ON DELETE CASCADE,
  position_key uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('PRIMARY', 'ACTING')),
  effective_from date NOT NULL,
  effective_to date NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  FOREIGN KEY (change_set_id, position_key)
    REFERENCES organization_positions(change_set_id, stable_key)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS organization_incumbencies_position_idx
  ON organization_incumbencies (change_set_id, position_key, kind, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS organization_authority_bindings (
  id uuid PRIMARY KEY,
  change_set_id uuid NOT NULL REFERENCES organization_change_sets(id) ON DELETE CASCADE,
  subject_kind text NOT NULL CHECK (subject_kind IN ('NODE', 'POSITION')),
  subject_key uuid NOT NULL,
  binding_type text NOT NULL CHECK (binding_type IN (
    'SUPERVISORY_PARENT', 'LEADER', 'UNIT_APPROVER',
    'GOVERNANCE_APPROVER', 'OVERSIGHT_PARENT'
  )),
  target_position_key uuid NOT NULL,
  vacancy_policy text NOT NULL DEFAULT 'CLIMB_TO_PARENT'
    CHECK (vacancy_policy IN ('CLIMB_TO_PARENT', 'REQUIRE_ACTING_OR_BLOCK', 'BLOCK')),
  effective_from date NOT NULL,
  effective_to date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (NOT (subject_kind = 'POSITION' AND subject_key = target_position_key)),
  FOREIGN KEY (change_set_id, target_position_key)
    REFERENCES organization_positions(change_set_id, stable_key)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS organization_authority_bindings_subject_idx
  ON organization_authority_bindings (
    change_set_id, subject_kind, subject_key, binding_type, effective_from, effective_to
  );

CREATE TABLE IF NOT EXISTS organization_reporting_overrides (
  id uuid PRIMARY KEY,
  change_set_id uuid NOT NULL REFERENCES organization_change_sets(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  manager_position_key uuid NULL,
  manager_employee_id uuid NULL REFERENCES employees(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  effective_from date NOT NULL,
  effective_to date NULL,
  created_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK ((manager_position_key IS NULL) <> (manager_employee_id IS NULL)),
  CHECK (manager_employee_id IS NULL OR manager_employee_id <> employee_id),
  FOREIGN KEY (change_set_id, manager_position_key)
    REFERENCES organization_positions(change_set_id, stable_key)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS organization_reporting_overrides_employee_idx
  ON organization_reporting_overrides (change_set_id, employee_id, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS organization_rollout_settings (
  id uuid PRIMARY KEY,
  workflow_key text NOT NULL CHECK (length(btrim(workflow_key)) > 0),
  node_key uuid NULL,
  mode text NOT NULL DEFAULT 'LEGACY' CHECK (mode IN ('LEGACY', 'SHADOW', 'STRUCTURE')),
  effective_from date NOT NULL,
  effective_to date NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  changed_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS organization_rollout_settings_lookup_idx
  ON organization_rollout_settings (workflow_key, node_key, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS organization_audit_events (
  id uuid PRIMARY KEY,
  actor_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NULL,
  change_set_id uuid NULL REFERENCES organization_change_sets(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_audit_events_time_idx
  ON organization_audit_events (occurred_at DESC);

-- Prevent overlapping effective rows inside one complete organization snapshot.
CREATE OR REPLACE FUNCTION enforce_organization_effective_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conflict_exists boolean;
BEGIN
  IF TG_TABLE_NAME = 'organization_incumbencies' THEN
    IF NEW.kind = 'PRIMARY' THEN
      SELECT EXISTS (
        SELECT 1 FROM organization_incumbencies other
        WHERE other.change_set_id = NEW.change_set_id
          AND other.position_key = NEW.position_key
          AND other.kind = 'PRIMARY'
          AND other.id <> NEW.id
          AND daterange(other.effective_from, other.effective_to, '[]')
              && daterange(NEW.effective_from, NEW.effective_to, '[]')
      ) INTO conflict_exists;
    ELSE
      conflict_exists := false;
    END IF;
  ELSIF TG_TABLE_NAME = 'organization_memberships' THEN
    IF NEW.is_primary THEN
      SELECT EXISTS (
        SELECT 1 FROM organization_memberships other
        WHERE other.change_set_id = NEW.change_set_id
          AND other.employee_id = NEW.employee_id
          AND other.is_primary
          AND other.id <> NEW.id
          AND daterange(other.effective_from, other.effective_to, '[]')
              && daterange(NEW.effective_from, NEW.effective_to, '[]')
      ) INTO conflict_exists;
    ELSE
      conflict_exists := false;
    END IF;
  ELSIF TG_TABLE_NAME = 'organization_reporting_overrides' THEN
    SELECT EXISTS (
      SELECT 1 FROM organization_reporting_overrides other
      WHERE other.change_set_id = NEW.change_set_id
        AND other.employee_id = NEW.employee_id
        AND other.id <> NEW.id
        AND daterange(other.effective_from, other.effective_to, '[]')
            && daterange(NEW.effective_from, NEW.effective_to, '[]')
    ) INTO conflict_exists;
  ELSIF TG_TABLE_NAME = 'organization_authority_bindings' THEN
    SELECT EXISTS (
      SELECT 1 FROM organization_authority_bindings other
      WHERE other.change_set_id = NEW.change_set_id
        AND other.subject_kind = NEW.subject_kind
        AND other.subject_key = NEW.subject_key
        AND other.binding_type = NEW.binding_type
        AND other.id <> NEW.id
        AND daterange(other.effective_from, other.effective_to, '[]')
            && daterange(NEW.effective_from, NEW.effective_to, '[]')
    ) INTO conflict_exists;
  ELSE
    conflict_exists := false;
  END IF;

  IF conflict_exists THEN
    RAISE EXCEPTION USING
      ERRCODE = '23P01',
      MESSAGE = 'overlapping effective organization assignment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_incumbencies_overlap_guard ON organization_incumbencies;
CREATE TRIGGER organization_incumbencies_overlap_guard
BEFORE INSERT OR UPDATE ON organization_incumbencies
FOR EACH ROW EXECUTE FUNCTION enforce_organization_effective_overlap();

DROP TRIGGER IF EXISTS organization_memberships_overlap_guard ON organization_memberships;
CREATE TRIGGER organization_memberships_overlap_guard
BEFORE INSERT OR UPDATE ON organization_memberships
FOR EACH ROW EXECUTE FUNCTION enforce_organization_effective_overlap();

DROP TRIGGER IF EXISTS organization_reporting_overrides_overlap_guard ON organization_reporting_overrides;
CREATE TRIGGER organization_reporting_overrides_overlap_guard
BEFORE INSERT OR UPDATE ON organization_reporting_overrides
FOR EACH ROW EXECUTE FUNCTION enforce_organization_effective_overlap();

DROP TRIGGER IF EXISTS organization_authority_bindings_overlap_guard ON organization_authority_bindings;
CREATE TRIGGER organization_authority_bindings_overlap_guard
BEFORE INSERT OR UPDATE ON organization_authority_bindings
FOR EACH ROW EXECUTE FUNCTION enforce_organization_effective_overlap();

CREATE OR REPLACE FUNCTION validate_organization_authority_subject()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.subject_kind = 'NODE' AND NOT EXISTS (
    SELECT 1 FROM organization_nodes
    WHERE change_set_id = NEW.change_set_id AND stable_key = NEW.subject_key
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'authority subject node does not exist';
  END IF;
  IF NEW.subject_kind = 'POSITION' AND NOT EXISTS (
    SELECT 1 FROM organization_positions
    WHERE change_set_id = NEW.change_set_id AND stable_key = NEW.subject_key
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'authority subject position does not exist';
  END IF;
  IF NEW.binding_type IN ('LEADER', 'UNIT_APPROVER') AND NEW.subject_kind <> 'NODE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'node authority requires a node subject';
  END IF;
  IF NEW.binding_type IN ('SUPERVISORY_PARENT', 'GOVERNANCE_APPROVER', 'OVERSIGHT_PARENT')
     AND NEW.subject_kind <> 'POSITION' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'position authority requires a position subject';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_authority_bindings_subject_guard ON organization_authority_bindings;
CREATE CONSTRAINT TRIGGER organization_authority_bindings_subject_guard
AFTER INSERT OR UPDATE ON organization_authority_bindings
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_organization_authority_subject();

-- Overlapping rollout rows at the same workflow/scope are ambiguous and fail closed.
CREATE OR REPLACE FUNCTION enforce_organization_rollout_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM organization_rollout_settings other
    WHERE other.workflow_key = NEW.workflow_key
      AND other.node_key IS NOT DISTINCT FROM NEW.node_key
      AND other.id <> NEW.id
      AND daterange(other.effective_from, other.effective_to, '[]')
          && daterange(NEW.effective_from, NEW.effective_to, '[]')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23P01', MESSAGE = 'overlapping organization rollout setting';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_rollout_settings_overlap_guard ON organization_rollout_settings;
CREATE TRIGGER organization_rollout_settings_overlap_guard
BEFORE INSERT OR UPDATE ON organization_rollout_settings
FOR EACH ROW EXECUTE FUNCTION enforce_organization_rollout_overlap();
