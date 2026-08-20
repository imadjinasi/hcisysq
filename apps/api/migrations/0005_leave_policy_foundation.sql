ALTER TABLE organizational_units
  ADD COLUMN IF NOT EXISTS leave_approver_employee_id uuid NULL REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organizational_units_leave_approver_idx
  ON organizational_units (leave_approver_employee_id)
  WHERE leave_approver_employee_id IS NOT NULL;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS leave_entitlement_group text NULL
    CHECK (leave_entitlement_group IN ('education', 'non_education'));

CREATE INDEX IF NOT EXISTS employees_leave_entitlement_group_idx
  ON employees (leave_entitlement_group)
  WHERE leave_entitlement_group IS NOT NULL;
