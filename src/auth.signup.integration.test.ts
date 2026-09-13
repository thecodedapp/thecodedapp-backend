import request from "supertest";
import bcrypt from "bcrypt";
import app from "./app";
import { prisma } from "./lib/prisma";
import { resend } from "./lib/email";

describe("POST /auth/signup integration", () => {
  const sendSpy = jest.spyOn(resend.emails, "send");

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    sendSpy.mockReset();
    sendSpy.mockResolvedValue({
      data: { id: "test-email-id" },
      error: null,
    } as any);

    await prisma.emailVerificationCode.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    sendSpy.mockRestore();
    await prisma.emailVerificationCode.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("creates a user and verification code for valid signup data", async () => {
    const response = await request(app).post("/auth/signup").send({
      email: "NewUser@Example.com",
      password: "Password1",
    });

    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user.email).toBe("newuser@example.com");
    expect(response.body.user.emailVerified).toBe(false);

    const user = await prisma.user.findUnique({
      where: { email: "newuser@example.com" },
    });

    expect(user).not.toBeNull();
    expect(user?.emailVerified).toBe(false);
    expect(user?.passwordHash).not.toBe("Password1");
    expect(await bcrypt.compare("Password1", user!.passwordHash)).toBe(true);

    const verificationRecord = await prisma.emailVerificationCode.findFirst({
      where: { userId: user!.id },
    });

    expect(verificationRecord).not.toBeNull();
    expect(verificationRecord?.codeHash).toEqual(expect.any(String));
    expect(verificationRecord!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Maco <verify@learnmaco.com>",
        to: "newuser@example.com",
        subject: "Your Maco verification code",
      })
    );
  });

  it("rejects signup when email is missing", async () => {
    const response = await request(app).post("/auth/signup").send({
      password: "Password1",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Email and password are required",
    });
    expect(await prisma.user.count()).toBe(0);
  });

  it("rejects signup when password is missing", async () => {
    const response = await request(app).post("/auth/signup").send({
      email: "user@example.com",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Email and password are required",
    });
    expect(await prisma.user.count()).toBe(0);
  });

  it("rejects an invalid email address", async () => {
    const response = await request(app).post("/auth/signup").send({
      email: "not-an-email",
      password: "Password1",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Please enter a valid email address",
    });
    expect(await prisma.user.count()).toBe(0);
  });

  it.each([
    ["too short", "Pass1"],
    ["missing uppercase letter", "password1"],
    ["missing number", "Password"],
  ])("rejects a password that is %s", async (_reason, password) => {
    const response = await request(app).post("/auth/signup").send({
      email: "user@example.com",
      password,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error:
        "Password must be at least 8 characters and include an uppercase letter and a number",
    });
    expect(await prisma.user.count()).toBe(0);
  });

  it("rejects an email that already has an account", async () => {
    await prisma.user.create({
      data: {
        email: "existing@example.com",
        passwordHash: await bcrypt.hash("Password1", 10),
      },
    });

    const response = await request(app).post("/auth/signup").send({
      email: "Existing@Example.com",
      password: "Password1",
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "An account with this email already exists",
    });
    expect(await prisma.user.count()).toBe(1);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("cleans up the user if the verification email fails to send", async () => {
    sendSpy.mockResolvedValueOnce({
      data: null,
      error: { message: "Email service unavailable" },
    } as any);

    const response = await request(app).post("/auth/signup").send({
      email: "cleanup@example.com",
      password: "Password1",
    });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: "Could not send verification email",
    });

    expect(
      await prisma.user.findUnique({
        where: { email: "cleanup@example.com" },
      })
    ).toBeNull();
    expect(await prisma.emailVerificationCode.count()).toBe(0);
  });
});
