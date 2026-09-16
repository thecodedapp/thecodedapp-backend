import { Router } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

const router = Router();

const getUserIdFromRequest = (authorization?: string) => {
  if (!authorization) return null;

  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) return null;

  const decoded = jwt.verify(
    token,
    process.env.JWT_SECRET as string
  ) as { userId: string };

  return decoded.userId;
};

const canonicalHighestUnlockedLesson = (completedLessons: number[]) =>
  completedLessons.length > 0 ? Math.max(...completedLessons) + 1 : 1;

router.get("/", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req.headers.authorization);

    if (!userId) {
      return res.status(401).json({ error: "Invalid or missing token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        goals: true,
        completedLessons: true,
        highestUnlockedLesson: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json(user);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    console.error(error);
    return res.status(500).json({ error: "Something went wrong" });
  }
});

router.put("/", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req.headers.authorization);

    if (!userId) {
      return res.status(401).json({ error: "Invalid or missing token" });
    }

    const { goals, completedLessons, highestUnlockedLesson } = req.body ?? {};

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        completedLessons: true,
        highestUnlockedLesson: true,
      },
    });

    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const data: {
      goals?: string[];
      completedLessons?: number[];
      highestUnlockedLesson?: number;
    } = {};

    if (goals !== undefined) {
      if (!Array.isArray(goals) || !goals.every((goal) => typeof goal === "string")) {
        return res.status(400).json({ error: "goals must be an array of strings" });
      }

      data.goals = Array.from(new Set(goals.map((goal) => goal.trim()).filter(Boolean)));
    }

    let nextCompletedLessons = existingUser.completedLessons;

    if (completedLessons !== undefined) {
      if (
        !Array.isArray(completedLessons) ||
        !completedLessons.every(
          (lesson) => Number.isInteger(lesson) && lesson > 0
        )
      ) {
        return res.status(400).json({
          error: "completedLessons must be an array of positive integers",
        });
      }

      nextCompletedLessons = Array.from(new Set(completedLessons)).sort(
        (a, b) => a - b
      );
      data.completedLessons = nextCompletedLessons;
    }

    if (highestUnlockedLesson !== undefined) {
      if (
        !Number.isInteger(highestUnlockedLesson) ||
        highestUnlockedLesson < 1
      ) {
        return res.status(400).json({
          error: "highestUnlockedLesson must be a positive integer",
        });
      }

      const expectedHighest = canonicalHighestUnlockedLesson(nextCompletedLessons);

      if (highestUnlockedLesson !== expectedHighest) {
        return res.status(400).json({
          error: `highestUnlockedLesson must be ${expectedHighest} for the submitted completedLessons`,
        });
      }

      data.highestUnlockedLesson = highestUnlockedLesson;
    } else if (completedLessons !== undefined) {
      data.highestUnlockedLesson = canonicalHighestUnlockedLesson(nextCompletedLessons);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        goals: true,
        completedLessons: true,
        highestUnlockedLesson: true,
      },
    });

    return res.status(200).json(user);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    console.error(error);
    return res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;
