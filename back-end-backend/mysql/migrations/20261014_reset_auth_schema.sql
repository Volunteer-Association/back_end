-- DESTRUCTIVE RESET for the currently inspected legacy schema.
-- This intentionally deletes all users, logs, files, auth, OAuth, and role data.
-- Back up the database before running. Do not run against a database whose data
-- must be retained. After this script, execute mysql/init.sql in the same schema.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS
  `email_verifications`,
  `refresh_tokens`,
  `oauth_states`,
  `oauth_login_codes`,
  `oauth_identities`,
  `user_roles`,
  `users`,
  `files`,
  `logs`,
  `pms_user`,
  `roles`;

SET FOREIGN_KEY_CHECKS = 1;
