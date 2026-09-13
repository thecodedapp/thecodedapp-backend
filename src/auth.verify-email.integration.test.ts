import request from "supertest";
import bcrypt from "bcrypt";
import app from "./app";
import { prisma } from "./lib/prisma";

describe("POST /auth/verify-email integration", () => {
  const email = "user@example.com";
  const code = "123456";

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.emailVerificationCode.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.emailVerificationCode.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  const createUnverifiedUserWithCode = async (expiresAt = new Date(Date.now() + 10 * 60 * 1000)) => {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash("Password1", 10),
        emailVerified: false,
      },
    });

    await prisma.emailVerificationCode.create({
      data: {
        userId: user.id,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt,
      },
    });

    return user;
  };

  it("verifies a valid code and removes verification records", async () => {
    const user = await createUnverifiedUserWithCode();

    const response = await request(app).post("/auth/verify-email").send({
      email: " User@Example.com ",
      code,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Email verified successfully" });

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser?.emailVerified).toBe(true);
    expect(await prisma.emailVerificationCode.count({ where: { userId: user.id } })).toBe(0);
  });

  it("rejects a missing email or code", async () => {
    const response = await request(app).post("/auth/verify-email").send({ email });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Email and verification code are required",
    });
  });

  it("rejects an unknown user", async () => {
    const response = await request(app).post("/auth/verify-email").send({
      email: "missing@example.com",
      code,
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "User not found" });
  });

  it("returns success when the email is already verified", async () => {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash("Password1", 10),
        emailVerified: true,
      },
    });

    const response = await request(app).post("/auth/verify-email").send({
      email,
      code,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Email is already verified" });
  });

  it("rejects an incorrect verification code", async () => {
    const user = await createUnverifiedUserWithCode();

    const response = await request(app).post("/auth/verify-email").send({
      email,
      code: "999999",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Verification code is invalid or expired",
    });
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.emailVerified).toBe(false);
  });

  it("rejects an expired verification code", async () => {
    await createUnverifiedUserWithCode(new Date(Date.now() - 60_000));

    const response = await request(app).post("/auth/verify-email").send({
      email,
      code,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Verification code is invalid or expired",
    });
  });
});
