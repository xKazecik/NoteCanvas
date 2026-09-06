import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb } from "./testUtils";

describe("Canvas comments - Backend Integration", () => {
  const userAgent = "vitest-comments";
  let prisma: PrismaClient;
  let app: any;

  let owner: { id: string; email: string };
  let editor: { id: string; email: string };
  let viewer: { id: string; email: string };
  let outsider: { id: string; email: string };

  let ownerToken: string;
  let editorToken: string;
  let viewerToken: string;
  let outsiderToken: string;

  const agents: Record<string, { agent: any; header: string; token: string }> =
    {};

  let drawingId: string;

  const signAccessToken = (user: { id: string; email: string }) => {
    const signOptions: SignOptions = {
      expiresIn: config.jwtAccessExpiresIn as StringValue,
    };
    return jwt.sign(
      { userId: user.id, email: user.email, type: "access" },
      config.jwtSecret,
      signOptions,
    );
  };

  const createUser = async (email: string, name: string) => {
    const passwordHash = await bcrypt.hash("password123", 10);
    return prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: "USER",
        isActive: true,
      },
      select: { id: true, email: true },
    });
  };

  const makeAgent = async (key: string) => {
    const agent = request.agent(app);
    const res = await agent.get("/csrf-token").set("User-Agent", userAgent);
    agents[key] = { agent, header: res.body.header, token: res.body.token };
  };

  const as = (key: string, token: string) => ({
    post: (url: string) =>
      agents[key].agent
        .post(url)
        .set("User-Agent", userAgent)
        .set("Authorization", `Bearer ${token}`)
        .set(agents[key].header, agents[key].token),
    patch: (url: string) =>
      agents[key].agent
        .patch(url)
        .set("User-Agent", userAgent)
        .set("Authorization", `Bearer ${token}`)
        .set(agents[key].header, agents[key].token),
    delete: (url: string) =>
      agents[key].agent
        .delete(url)
        .set("User-Agent", userAgent)
        .set("Authorization", `Bearer ${token}`)
        .set(agents[key].header, agents[key].token),
    get: (url: string) =>
      agents[key].agent
        .get(url)
        .set("User-Agent", userAgent)
        .set("Authorization", `Bearer ${token}`),
  });

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    ({ app } = await import("../index"));

    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { authEnabled: true, registrationEnabled: false },
      create: { id: "default", authEnabled: true, registrationEnabled: false },
    });

    owner = await createUser("owner-comments@test.local", "Owner User");
    editor = await createUser("editor-comments@test.local", "Editor User");
    viewer = await createUser("viewer-comments@test.local", "Viewer User");
    outsider = await createUser("outsider-comments@test.local", "Outsider");

    ownerToken = signAccessToken(owner);
    editorToken = signAccessToken(editor);
    viewerToken = signAccessToken(viewer);
    outsiderToken = signAccessToken(outsider);

    await makeAgent("owner");
    await makeAgent("editor");
    await makeAgent("viewer");
    await makeAgent("outsider");

    const drawing = await prisma.drawing.create({
      data: {
        name: "Commented Drawing",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: owner.id,
      },
      select: { id: true },
    });
    drawingId = drawing.id;

    await prisma.drawingPermission.createMany({
      data: [
        {
          drawingId,
          granteeUserId: editor.id,
          permission: "edit",
          createdByUserId: owner.id,
        },
        {
          drawingId,
          granteeUserId: viewer.id,
          permission: "view",
          createdByUserId: owner.id,
        },
      ],
    });
  }, 120000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a thread with its first comment and returns it", async () => {
    const response = await as("owner", ownerToken)
      .post(`/drawings/${drawingId}/comment-threads`)
      .send({ x: 120.5, y: -40, content: "Does this arrow point the right way?" });

    expect(response.status).toBe(201);
    expect(response.body.thread.x).toBe(120.5);
    expect(response.body.thread.y).toBe(-40);
    expect(response.body.thread.resolved).toBe(false);
    expect(response.body.thread.commentCount).toBe(1);
    expect(response.body.thread.comments[0].content).toBe(
      "Does this arrow point the right way?",
    );
    expect(response.body.thread.createdBy.id).toBe(owner.id);
  });

  it("lets an editor reply, and keeps the thread's comments in order", async () => {
    const created = await as("owner", ownerToken)
      .post(`/drawings/${drawingId}/comment-threads`)
      .send({ x: 1, y: 2, content: "First" });
    const threadId = created.body.thread.id;

    const reply = await as("editor", editorToken)
      .post(`/comment-threads/${threadId}/comments`)
      .send({ content: "Second" });

    expect(reply.status).toBe(201);
    expect(reply.body.thread.commentCount).toBe(2);
    expect(reply.body.thread.comments.map((c: any) => c.content)).toEqual([
      "First",
      "Second",
    ]);
    expect(reply.body.thread.comments[1].createdBy.id).toBe(editor.id);
  });

  it("refuses comments from someone with only view access", async () => {
    const created = await as("owner", ownerToken)
      .post(`/drawings/${drawingId}/comment-threads`)
      .send({ x: 3, y: 4, content: "Owner note" });

    const asViewer = await as("viewer", viewerToken)
      .post(`/comment-threads/${created.body.thread.id}/comments`)
      .send({ content: "Viewer reply" });

    expect(asViewer.status).toBe(403);
  });

  it("lets a viewer read threads", async () => {
    const response = await as("viewer", viewerToken).get(
      `/drawings/${drawingId}/comment-threads`,
    );

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.threads)).toBe(true);
  });

  it("hides the drawing's threads from someone with no access", async () => {
    const response = await as("outsider", outsiderToken).get(
      `/drawings/${drawingId}/comment-threads`,
    );

    expect(response.status).toBe(404);
  });

  it("records a mention of someone with access and drops one without", async () => {
    const response = await as("owner", ownerToken)
      .post(`/drawings/${drawingId}/comment-threads`)
      .send({
        x: 5,
        y: 6,
        content: "Ping",
        mentions: [editor.id, outsider.id, "not-a-real-user"],
      });

    expect(response.status).toBe(201);
    expect(response.body.thread.comments[0].mentions).toEqual([editor.id]);
  });

  it("resolves and reopens a thread, recording who resolved it", async () => {
    const created = await as("owner", ownerToken)
      .post(`/drawings/${drawingId}/comment-threads`)
      .send({ x: 7, y: 8, content: "To resolve" });
    const threadId = created.body.thread.id;

    const resolved = await as("editor", editorToken)
      .patch(`/comment-threads/${threadId}`)
      .send({ resolved: true });

    expect(resolved.status).toBe(200);
    expect(resolved.body.thread.resolved).toBe(true);
    expect(resolved.body.thread.resolvedBy.id).toBe(editor.id);

    const reopened = await as("owner", ownerToken)
      .patch(`/comment-threads/${threadId}`)
      .send({ resolved: false });

    expect(reopened.body.thread.resolved).toBe(false);
    expect(reopened.body.thread.resolvedBy).toBeNull();
  });

  it("rejects an empty comment and a thread without coordinates", async () => {
    const empty = await as("owner", ownerToken)
      .post(`/drawings/${drawingId}/comment-threads`)
      .send({ x: 1, y: 1, content: "   " });
    expect(empty.status).toBe(400);

    const noCoords = await as("owner", ownerToken)
      .post(`/drawings/${drawingId}/comment-threads`)
      .send({ content: "Where?" });
    expect(noCoords.status).toBe(400);
  });

  it("lets the author delete their thread but not an unrelated editor", async () => {
    const created = await as("editor", editorToken)
      .post(`/drawings/${drawingId}/comment-threads`)
      .send({ x: 9, y: 10, content: "Editor's thread" });
    const threadId = created.body.thread.id;

    // The viewer is not the author and does not own the drawing.
    const refused = await as("viewer", viewerToken).delete(
      `/comment-threads/${threadId}`,
    );
    expect(refused.status).toBe(403);

    const deleted = await as("editor", editorToken).delete(
      `/comment-threads/${threadId}`,
    );
    expect(deleted.status).toBe(200);

    expect(
      await prisma.commentThread.findUnique({ where: { id: threadId } }),
    ).toBeNull();
  });

  it("lets the drawing owner delete someone else's thread", async () => {
    const created = await as("editor", editorToken)
      .post(`/drawings/${drawingId}/comment-threads`)
      .send({ x: 11, y: 12, content: "Editor's second thread" });

    const deleted = await as("owner", ownerToken).delete(
      `/comment-threads/${created.body.thread.id}`,
    );

    expect(deleted.status).toBe(200);
  });

  it("deletes a thread's comments along with it", async () => {
    const created = await as("owner", ownerToken)
      .post(`/drawings/${drawingId}/comment-threads`)
      .send({ x: 13, y: 14, content: "Has replies" });
    const threadId = created.body.thread.id;
    await as("editor", editorToken)
      .post(`/comment-threads/${threadId}/comments`)
      .send({ content: "A reply" });

    await as("owner", ownerToken).delete(`/comment-threads/${threadId}`);

    expect(await prisma.comment.count({ where: { threadId } })).toBe(0);
  });

  it("offers the drawing's own people as mention targets, not everyone", async () => {
    const response = await as("owner", ownerToken).get(
      `/drawings/${drawingId}/mentionable-users`,
    );

    expect(response.status).toBe(200);
    const ids = response.body.users.map((u: any) => u.id);
    expect(ids).toContain(owner.id);
    expect(ids).toContain(editor.id);
    expect(ids).toContain(viewer.id);
    expect(ids).not.toContain(outsider.id);
  });
});
