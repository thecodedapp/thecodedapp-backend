import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "./app";
import { prisma } from "./lib/prisma";

describe("GET /auth/me integration", () => {
  const email = "user@example.com";

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

  const createUserAndToken = async (emailVerified = true) => {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash("Password1", 10),
        emailVerified,
      },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    return { user, token };
  };

  it("returns the authenticated user for a valid token", async () => {
    const { user, token } = await createUserAndToken();

    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(
      expect.objectContaining({
        id: user.id,
        email,
        emailVerified: true,
      })
    );
    expect(response.body.user.createdAt).toEqual(expect.any(String));
  });

  it("allows an unverified user to read their profile", async () => {
    const { token } = await createUserAndToken(false);

    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user.emailVerified).toBe(false);
  });

  it("rejects a request without a token", async () => {
    const response = await request(app).get("/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "No token provided" });
  });

  it("rejects a malformed authorization header", async () => {
    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid authorization header" });
  });

  it("rejects an invalid token", async () => {
    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer definitely-not-a-jwt");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid or expired token" });
  });

  it("rejects a valid token when its user no longer exists", async () => {
    const { user, token } = await createUserAndToken();
    await prisma.user.delete({ where: { id: user.id } });

    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "User not found" });
  });
});
