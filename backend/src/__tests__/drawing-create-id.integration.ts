import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb } from "./testUtils";

// A drawing made while offline gets its id in the browser, and is created on
// the server under that same id once the connection is back.
describe("Drawings - creating with a client-chosen id", () => {
  const userAgent = "vitest-drawing-create-id";
  let prisma: PrismaClient;
  let app: any;

  const tokenFor = (id: string, email: string) => {
    const signOptions: SignOptions = {
      expiresIn: config.jwtAccessExpiresIn as StringValue,
    };
    return jwt.sign(
      { userId: id, email, type: "access" },
      config.jwtSecret,
      signOptions,
    );
  };

  const createUser = async (email: string) =>
    prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash("password123", 10),
        name: email,
      },
      select: { id: true, email: true },
    });

  const poster = async (user: { id: string; email: string }) => {
    const agent = request.agent(app);
    const csrf = await agent.get("/csrf-token").set("User-Agent", userAgent);
    return (body: object) =>
      agent
        .post("/drawings")
        .set("User-Agent", userAgent)
        .set("Authorization", `Bearer ${tokenFor(user.id, user.email)}`)
        .set(csrf.body.header as string, csrf.body.token as string)
        .send(body);
  };

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    ({ app } = await import("../index"));

    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { authEnabled: true, registrationEnabled: false },
      create: { id: "default", authEnabled: true, registrationEnabled: false },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates the drawing under the id it was given", async () => {
    const post = await poster(await createUser("create-id-a@test.local"));
    const id = "0b8f6d0e-6c0a-4f6e-9a55-2f1f4f0e7a01";

    const created = await post({ id, name: "Made offline", elements: [] });
    expect(created.status).toBe(200);
    expect(created.body.id).toBe(id);
    expect(created.body.name).toBe("Made offline");
  });

  it("answers a repeated create with the drawing instead of a duplicate", async () => {
    const user = await createUser("create-id-b@test.local");
    const post = await poster(user);
    const id = "0b8f6d0e-6c0a-4f6e-9a55-2f1f4f0e7a02";

    await post({ id, name: "First try", elements: [] });
    const again = await post({ id, name: "Second try", elements: [] });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(id);
    // the first create stands; later edits arrive as normal updates
    expect(again.body.name).toBe("First try");
    expect(await prisma.drawing.count({ where: { userId: user.id } })).toBe(1);
  });

  it("refuses an id that belongs to someone else's drawing", async () => {
    const postAsOwner = await poster(await createUser("create-id-c@test.local"));
    const postAsOther = await poster(await createUser("create-id-d@test.local"));
    const id = "0b8f6d0e-6c0a-4f6e-9a55-2f1f4f0e7a03";

    await postAsOwner({ id, name: "Mine", elements: [] });
    const taken = await postAsOther({ id, name: "Not mine", elements: [] });
    expect(taken.status).toBe(409);
  });

  it("rejects an id that is not a UUID", async () => {
    const post = await poster(await createUser("create-id-e@test.local"));
    const bad = await post({ id: "../../etc/passwd", name: "x", elements: [] });
    expect(bad.status).toBe(400);
  });
});
