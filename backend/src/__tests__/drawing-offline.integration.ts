import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb } from "./testUtils";

describe("Drawings - offline mode", () => {
  const userAgent = "vitest-drawing-offline";
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

  const agentWithCsrf = async () => {
    const agent = request.agent(app);
    const res = await agent.get("/csrf-token").set("User-Agent", userAgent);
    return {
      agent,
      csrfHeader: res.body.header as string,
      csrfToken: res.body.token as string,
    };
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

  it("caps editors at view while offline and restores the same access after", async () => {
    const passwordHash = await bcrypt.hash("password123", 10);
    const owner = await prisma.user.create({
      data: { email: "owner-off@test.local", passwordHash, name: "Owner" },
      select: { id: true, email: true },
    });
    const editor = await prisma.user.create({
      data: { email: "editor-off@test.local", passwordHash, name: "Editor" },
      select: { id: true, email: true },
    });
    const drawing = await prisma.drawing.create({
      data: {
        name: "Offline drawing",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: owner.id,
        version: 1,
      },
      select: { id: true },
    });
    await prisma.drawingPermission.create({
      data: {
        drawingId: drawing.id,
        granteeUserId: editor.id,
        permission: "edit",
        createdByUserId: owner.id,
      },
    });

    const ownerToken = tokenFor(owner.id, owner.email);
    const editorToken = tokenFor(editor.id, editor.email);
    const { agent, csrfHeader, csrfToken } = await agentWithCsrf();
    const send = (
      method: "put" | "post",
      path: string,
      token: string,
      body: unknown,
    ) =>
      agent[method](path)
        .set("User-Agent", userAgent)
        .set("Authorization", `Bearer ${token}`)
        .set(csrfHeader, csrfToken)
        .send(body as object);
    const read = (token: string) =>
      request(app)
        .get(`/drawings/${drawing.id}`)
        .set("User-Agent", userAgent)
        .set("Authorization", `Bearer ${token}`);

    const candidates = await request(app)
      .get("/drawings/offline-candidates")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(candidates.status).toBe(200);
    expect(candidates.body.drawings).toContainEqual(
      expect.objectContaining({ id: drawing.id, isShared: true }),
    );

    // Only the owner may take it offline.
    const notOwner = await send(
      "put",
      `/drawings/${drawing.id}/offline`,
      editorToken,
      { offline: true },
    );
    expect(notOwner.status).toBe(404);

    const goOffline = await send(
      "put",
      `/drawings/${drawing.id}/offline`,
      ownerToken,
      { offline: true },
    );
    expect(goOffline.status).toBe(200);
    expect(goOffline.body.offlineAt).toBeTruthy();

    const editorView = await read(editorToken);
    expect(editorView.body.accessLevel).toBe("view");
    expect(editorView.body.offlineAt).toBeTruthy();

    const editorWrite = await send("put", `/drawings/${drawing.id}`, editorToken, {
      name: "Renamed by editor",
    });
    expect(editorWrite.status).toBe(404);

    // The owner keeps syncing while offline.
    const ownerWrite = await send("put", `/drawings/${drawing.id}`, ownerToken, {
      name: "Renamed by owner",
    });
    expect(ownerWrite.status).toBe(200);

    // No new shares while offline.
    const newShare = await send(
      "post",
      `/drawings/${drawing.id}/link-shares`,
      ownerToken,
      { permission: "view" },
    );
    expect(newShare.status).toBe(409);
    expect(newShare.body.code).toBe("DRAWING_OFFLINE");

    const goOnline = await send(
      "put",
      `/drawings/${drawing.id}/offline`,
      ownerToken,
      { offline: false },
    );
    expect(goOnline.status).toBe(200);
    expect(goOnline.body.offlineAt).toBeNull();

    const editorAgain = await read(editorToken);
    expect(editorAgain.body.accessLevel).toBe("edit");
  });
});
