-- NOT a migration: a superuser runs this ONCE per deployment, then `npm run db:migrate`
-- again so 015_row_level_security.sql grants the new role exactly the product tables.
--
-- spine_app is the login role for tenant-facing traffic (the dashboard / API). It is
-- subject to row-level security and can never use the platform's service path
-- (spine_is_service() refuses it), so one organisation can never read another's rows.
-- psql -v spine_app_password=… -f db/roles.example.sql  (the password never goes in the repository)
CREATE ROLE spine_app LOGIN PASSWORD :'spine_app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
