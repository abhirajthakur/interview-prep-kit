import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/auth/password.js";

describe("password hashing", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("never stores the password in plain text", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash).not.toContain("hunter2");
  });

  it("salts each hash differently", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toBe(b);
  });
});
