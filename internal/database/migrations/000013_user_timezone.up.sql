ALTER TABLE users
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(64),
    ADD COLUMN IF NOT EXISTS locale VARCHAR(16) NOT NULL DEFAULT 'vi-VN';

ALTER TABLE users
    ADD CONSTRAINT users_timezone_iana_length CHECK (timezone IS NULL OR length(timezone) BETWEEN 1 AND 64);
