CREATE TABLE IF NOT EXISTS shared_team(id text PRIMARY KEY CHECK(id='team'),revision integer NOT NULL,snapshot jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),updated_by text NOT NULL);
CREATE TABLE IF NOT EXISTS team_media(hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),content_type text NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp')),bytes bytea NOT NULL CHECK(octet_length(bytes)<=8000000));
CREATE TABLE IF NOT EXISTS login_attempts(key text NOT NULL,bucket bigint NOT NULL,count integer NOT NULL,PRIMARY KEY(key,bucket));
CREATE TABLE IF NOT EXISTS media_uploads(id uuid PRIMARY KEY,hash text NOT NULL,content_type text NOT NULL,size integer NOT NULL CHECK(size BETWEEN 1 AND 8000000),expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes');
CREATE TABLE IF NOT EXISTS media_chunks(upload_id uuid REFERENCES media_uploads(id) ON DELETE CASCADE,part integer NOT NULL CHECK(part BETWEEN 0 AND 3),bytes bytea NOT NULL CHECK(octet_length(bytes)<=2000000),PRIMARY KEY(upload_id,part));
REVOKE ALL ON shared_team,team_media,login_attempts,media_uploads,media_chunks FROM PUBLIC;
