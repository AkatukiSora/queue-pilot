\getenv runtime_password RUNTIME_DB_PASSWORD
CREATE ROLE queue_pilot_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE queue_pilot_runtime_login
  LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE
  PASSWORD :'runtime_password';
GRANT queue_pilot_runtime TO queue_pilot_runtime_login;
