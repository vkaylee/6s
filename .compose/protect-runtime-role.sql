\getenv runtime_user RUNTIME_USER
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.schema_migrations FROM :"runtime_user";
GRANT SELECT ON TABLE public.schema_migrations TO :"runtime_user";
