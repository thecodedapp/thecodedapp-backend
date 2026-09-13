import request from "supertest";
import app from "./app";

describe("Maco API", () => {
  it("returns a healthy status", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
    });
  });

  it("rejects login when email and password are missing", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Email and password are required",
    });
  });
});
