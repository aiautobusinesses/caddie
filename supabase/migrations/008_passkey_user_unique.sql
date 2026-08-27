-- Add unique constraint on user_id so upsert can target it
-- (one passkey credential per user)
alter table passkey_credentials add constraint passkey_credentials_user_id_key unique (user_id);
