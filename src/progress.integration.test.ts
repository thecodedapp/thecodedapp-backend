import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import app from "./app";
import { prisma } from "./lib/prisma";

describe("/progress integration", () => {
  const email = "progress@example.com";
  const password = "Password1";

  let userId: string;
  let token: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.emailVerificationCode.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        emailVerified: true,
      },
    });

    userId = user.id;
    token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );
  });

  afterAll(async () => {
    await prisma.emailVerificationCode.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  describe("GET /progress", () => {
    it("returns the signed-in user's default progress", async () => {
      const response = await request(app)
        .get("/progress")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        goals: [],
        completedLessons: [],
        highestUnlockedLesson: 1,
      });
    });

    it("returns saved progress", async () => {
      await prisma.user.update({
        where: { id: userId },
        data: {
          goals: ["Learn the basics", "Build apps"],
          completedLessons: [1, 2],
          highestUnlockedLesson: 3,
        },
      });

      const response = await request(app)
        .get("/progress")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        goals: ["Learn the basics", "Build apps"],
        completedLessons: [1, 2],
        highestUnlockedLesson: 3,
      });
    });

    it("rejects a missing token", async () => {
      const response = await request(app).get("/progress");

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Invalid or missing token" });
    });

    it("rejects an invalid token", async () => {
      const response = await request(app)
        .get("/progress")
        .set("Authorization", "Bearer definitely-not-a-jwt");

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Invalid or expired token" });
    });

    it("returns 404 when the token belongs to a deleted user", async () => {
      await prisma.user.delete({ where: { id: userId } });

      const response = await request(app)
        .get("/progress")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "User not found" });
    });
  });

  describe("PUT /progress", () => {
    it("updates goals and lesson progress", async () => {
      const response = await request(app)
        .put("/progress")
        .set("Authorization", `Bearer ${token}`)
        .send({
          goals: ["Learn the basics", "Build apps"],
          completedLessons: [1, 2],
          highestUnlockedLesson: 3,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        goals: ["Learn the basics", "Build apps"],
        completedLessons: [1, 2],
        highestUnlockedLesson: 3,
      });

      const saved = await prisma.user.findUnique({ where: { id: userId } });
      expect(saved?.goals).toEqual(["Learn the basics", "Build apps"]);
      expect(saved?.completedLessons).toEqual([1, 2]);
      expect(saved?.highestUnlockedLesson).toBe(3);
    });

    it("trims and deduplicates goals and completed lessons", async () => {
      const response = await request(app)
        .put("/progress")
        .set("Authorization", `Bearer ${token}`)
        .send({
          goals: ["  Build apps  ", "Build apps", "", "   ", "Interview prep"],
          completedLessons: [3, 1, 3, 2, 1],
          highestUnlockedLesson: 4,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        goals: ["Build apps", "Interview prep"],
        completedLessons: [1, 2, 3],
        highestUnlockedLesson: 4,
      });
    });

    it("supports partial updates without erasing other progress", async () => {
      await prisma.user.update({
        where: { id: userId },
        data: {
          goals: ["Keep this goal"],
          completedLessons: [1, 2],
          highestUnlockedLesson: 3,
        },
      });

      const response = await request(app)
        .put("/progress")
        .set("Authorization", `Bearer ${token}`)
        .send({ goals: ["New goal"] });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        goals: ["New goal"],
        completedLessons: [1, 2],
        highestUnlockedLesson: 3,
      });
    });

    it("rejects invalid goals", async () => {
      const response = await request(app)
        .put("/progress")
        .set("Authorization", `Bearer ${token}`)
        .send({ goals: ["valid", 42] });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "goals must be an array of strings",
      });
    });

    it("rejects invalid completed lessons", async () => {
      const response = await request(app)
        .put("/progress")
        .set("Authorization", `Bearer ${token}`)
        .send({ completedLessons: [1, 0, 2] });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "completedLessons must be an array of positive integers",
      });
    });

    it("rejects an invalid highest unlocked lesson", async () => {
      const response = await request(app)
        .put("/progress")
        .set("Authorization", `Bearer ${token}`)
        .send({ highestUnlockedLesson: 0 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "highestUnlockedLesson must be a positive integer",
      });
    });

    it("rejects a missing token", async () => {
      const response = await request(app).put("/progress").send({
        goals: ["Learn"],
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Invalid or missing token" });
    });

    it("returns 404 when the token belongs to a deleted user", async () => {
      await prisma.user.delete({ where: { id: userId } });

      const response = await request(app)
        .put("/progress")
        .set("Authorization", `Bearer ${token}`)
        .send({ goals: ["Learn"] });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "User not found" });
    });
  });
});
