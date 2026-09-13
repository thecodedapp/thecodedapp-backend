import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "./app";
import { prisma } from "./lib/prisma";

describe("POST /auth/login integration", () => {
  const password = "Password1";
  const email = "user@example.com";

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.emailVerificationCode.deleteMany();
    await prisma.user.deleteMany();

    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        emailVerified: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.emailVerificationCode.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("logs in with valid credentials and returns a JWT", async () => {
    const response = await request(app).post("/auth/login").send({
      email,
      password,
    });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toEqual(
      expect.objectContaining({
        email,
        emailVerified: true,
      })
    );

    const decoded = jwt.verify(
      response.body.token,
      process.env.JWT_SECRET as string
    ) as {
      userId: string;
      email: string;
    };

    const user = await prisma.user.findUnique({
      where: { email },
    });

    expect(decoded.userId).toBe(user!.id);
    expect(decoded.email).toBe(email);
  });

  it("normalizes the email before logging in", async () => {
    const response = await request(app).post("/auth/login").send({
      email: "  User@Example.com  ",
      password,
    });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(email);
  });

  it("returns emailVerified false for an unverified user", async () => {
    await prisma.user.update({
      where: { email },
      data: { emailVerified: false },
    });

    const response = await request(app).post("/auth/login").send({
      email,
      password,
    });

    expect(response.status).toBe(200);
    expect(response.body.user.emailVerified).toBe(false);
  });

  it("rejects login when the email is missing", async () => {
    const response = await request(app).post("/auth/login").send({
      password,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Email and password are required",
    });
  });

  it("rejects login when the password is missing", async () => {
    const response = await request(app).post("/auth/login").send({
      email,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Email and password are required",
    });
  });

  it("rejects an unknown email", async () => {
    const response = await request(app).post("/auth/login").send({
      email: "missing@example.com",
      password,
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Invalid email or password",
    });
  });

  it("rejects an incorrect password", async () => {
    const response = await request(app).post("/auth/login").send({
      email,
      password: "WrongPassword1",
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Invalid email or password",
    });
  });
});
