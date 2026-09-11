import { randomInt } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { resend } from "../lib/email";

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
      where: {
        email: normalizedEmail,
      },
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

    // 8. Generate a secure 6-digit email verification code
    const verificationCode = randomInt(100000, 1000000).toString();

    // 9. Hash the verification code before storing it
    const verificationCodeHash = await bcrypt.hash(
      verificationCode,
      10
    );

    // 10. Make the code expire in 10 minutes
    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    );

    // 11. Save verification code in database
    await prisma.emailVerificationCode.create({
      data: {
        userId: user.id,
        codeHash: verificationCodeHash,
        expiresAt,
      },
    });

    const { error: emailError } = await resend.emails.send({
        from: "Maco <onboarding@resend.dev>",
        to: user.email,
        subject: "Your Maco verification code",
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>Welcome to Maco 🐸</h2>
      
            <p>Your verification code is:</p>
      
            <div style="
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 8px;
              margin: 24px 0;
            ">
              ${verificationCode}
            </div>
      
            <p>This code expires in 10 minutes.</p>
      
            <p>If you didn't create a Maco account, you can ignore this email.</p>
          </div>
        `,
      });
      
      if (emailError) {
        console.error("Failed to send verification email:", emailError);
      
        return res.status(500).json({
          error: "Could not send verification email",
        });
      }

    // 12. Create JWT
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

    // 13. Send safe user info + token back to frontend
    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
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
        emailVerified: user.emailVerified,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Something went wrong",
    });
  }
});

router.post("/verify-email", async (req, res) => {
    try {
      const { email, code } = req.body;
  
      if (!email || !code) {
        return res.status(400).json({
          error: "Email and verification code are required",
        });
      }
  
      const normalizedEmail = email.trim().toLowerCase();
  
      const user = await prisma.user.findUnique({
        where: {
          email: normalizedEmail,
        },
      });
  
      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }
  
      if (user.emailVerified) {
        return res.status(200).json({
          message: "Email is already verified",
        });
      }
  
      const verificationRecord =
        await prisma.emailVerificationCode.findFirst({
          where: {
            userId: user.id,
            expiresAt: {
              gt: new Date(),
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
  
      if (!verificationRecord) {
        return res.status(400).json({
          error: "Verification code is invalid or expired",
        });
      }
  
      const codeMatches = await bcrypt.compare(
        code,
        verificationRecord.codeHash
      );
  
      if (!codeMatches) {
        return res.status(400).json({
          error: "Verification code is invalid or expired",
        });
      }
  
      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          emailVerified: true,
        },
      });
  
      await prisma.emailVerificationCode.deleteMany({
        where: {
          userId: user.id,
        },
      });
  
      return res.status(200).json({
        message: "Email verified successfully",
      });
    } catch (error) {
      console.error(error);
  
      return res.status(500).json({
        error: "Something went wrong",
      });
    }
  });

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        error: "Invalid authorization header",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as {
      userId: string;
      email: string;
    };

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.userId,
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        error: "User not found",
      });
    }

    return res.status(200).json({
      user,
    });
  } catch (error) {
    return res.status(401).json({
      error: "Invalid or expired token",
    });
  }
});

export default router;