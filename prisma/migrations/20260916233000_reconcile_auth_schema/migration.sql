-- Bring older databases created from the original migration up to the current auth schema.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Preserve existing password data from the original schema when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name = 'password'
  ) THEN
    EXECUTE 'UPDATE "User" SET "passwordHash" = "password" WHERE "passwordHash" IS NULL';
  END IF;
END $$;

ALTER TABLE "User"
  ALTER COLUMN "passwordHash" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "EmailVerificationCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationCode_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmailVerificationCode_userId_fkey'
  ) THEN
    ALTER TABLE "EmailVerificationCode"
      ADD CONSTRAINT "EmailVerificationCode_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "User" DROP COLUMN IF EXISTS "password";
