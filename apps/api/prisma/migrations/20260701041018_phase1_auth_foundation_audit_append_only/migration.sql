-- Create an append-only enforcement trigger for audit_logs.
CREATE OR REPLACE FUNCTION enforce_audit_log_immutable()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Audit log records are immutable and may not be updated or deleted';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION enforce_audit_log_immutable();

-- Optionally revoke direct update/delete privileges to reinforce immutability.
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
