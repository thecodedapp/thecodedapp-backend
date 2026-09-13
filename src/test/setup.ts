process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.RESEND_API_KEY ??= "re_test_placeholder";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Integration tests require DATABASE_URL to point to the maco_test database");
}

let databaseName = "";

try {
  databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
} catch {
  throw new Error("Integration tests require a valid DATABASE_URL for the maco_test database");
}

if (databaseName !== "maco_test") {
  throw new Error(
    `Integration tests must use the maco_test database, not ${databaseName || "an unnamed database"}`
  );
}
