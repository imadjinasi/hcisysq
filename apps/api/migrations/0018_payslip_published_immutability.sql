CREATE OR REPLACE FUNCTION prevent_published_payslip_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'published payslip is immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payslips_published_immutable ON payslips;
CREATE TRIGGER payslips_published_immutable
BEFORE UPDATE OR DELETE ON payslips
FOR EACH ROW
EXECUTE FUNCTION prevent_published_payslip_mutation();
