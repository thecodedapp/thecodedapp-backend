import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

const router = Router();
router.post("/signup", async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // 1. Make sure both fields exist
      if (!email || !password) {
        return res.status(400).json({
          error: "Email and password are required",
        });
      }
  
      // 2. Normalize email
      const normalizedEmail = email.trim().toLowerCase();
  
      // 3. Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
      if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({
          error: "Please enter a valid email address",
        });
      }
  
      // 4. Validate password format
      const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
  
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          error:
            "Password must be at least 8 characters and include an uppercase letter and a number",
        });
      }
  
      // 5. Check if email already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
  
      if (existingUser) {
        return res.status(409).json({
          error: "An account with this email already exists",
        });
      }
  
      // 6. Hash password
      const passwordHash = await bcrypt.hash(password, 10);
  
      // 7. Create user
      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
        },
      });
  
      // ...JWT comes after this
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
        },
        process.env.JWT_SECRET as string,
        {
          expiresIn: "7d",
        }
      );
      
      return res.status(201).json({
        token,
        user: {
          id: user.id,
          email: user.email,
        },
      });
    } catch (error) {
      console.error(error);
  
      return res.status(500).json({
        error: "Something went wrong",
      });
    }
  });
  router.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body;
  
      if (!email || !password) {
        return res.status(400).json({
          error: "Email and password are required",
        });
      }
  
      const normalizedEmail = email.trim().toLowerCase();
  
      const user = await prisma.user.findUnique({
        where: {
          email: normalizedEmail,
        },
      });
  
      if (!user) {
        return res.status(401).json({
          error: "Invalid email or password",
        });
      }
  
      const passwordMatches = await bcrypt.compare(
        password,
        user.passwordHash
      );
  
      if (!passwordMatches) {
        return res.status(401).json({
          error: "Invalid email or password",
        });
      }
  
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
        },
        process.env.JWT_SECRET as string,
        {
          expiresIn: "7d",
        }
      );
  
      return res.status(200).json({
        token,
        user: {
          id: user.id,
          email: user.email,
        },
      });
    } catch (error) {
      console.error(error);
  
      return res.status(500).json({
        error: "Something went wrong",
      });
    }
  });

export default router;