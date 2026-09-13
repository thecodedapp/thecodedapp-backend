import request from "supertest";
import bcrypt from "bcrypt";
import app from "./app";
import { prisma } from "./lib/prisma";
import { resend } from "./lib/email";

describe("POST /auth/resend-verification integration", () => {
  const email = "user@example.com";
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

  const createUser = async (emailVerified = false) =>
    prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash("Password1", 10),
        emailVerified,
      },
    });

  it("replaces old codes, stores a fresh code, and sends an email", async () => {
    const user = await createUser();
    await prisma.emailVerificationCode.create({
      data: {
        userId: user.id,
        codeHash: await bcrypt.hash("111111", 10),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const response = await request(app).post("/auth/resend-verification").send({
      email: " User@Example.com ",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Verification code resent" });

    const records = await prisma.emailVerificationCode.findMany({
      where: { userId: user.id },
    });
    expect(records).toHaveLength(1);
    expect(records[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(await bcrypt.compare("111111", records[0].codeHash)).toBe(false);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Maco <verify@learnmaco.com>",
        to: email,
        subject: "Your new Maco verification code",
      })
    );
  });

  it("rejects a missing email", async () => {
    const response = await request(app).post("/auth/resend-verification").send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Email is required" });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("rejects an unknown user", async () => {
    const response = await request(app).post("/auth/resend-verification").send({
      email: "missing@example.com",
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "User not found" });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("rejects an already verified account", async () => {
    await createUser(true);

    const response = await request(app).post("/auth/resend-verification").send({ email });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Email is already verified" });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("returns an error when the email provider fails", async () => {
    const user = await createUser();
    sendSpy.mockResolvedValueOnce({
      data: null,
      error: { message: "Email service unavailable" },
    } as any);

    const response = await request(app).post("/auth/resend-verification").send({ email });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Could not resend verification email" });
    expect(await prisma.emailVerificationCode.count({ where: { userId: user.id } })).toBe(1);
  });
});
