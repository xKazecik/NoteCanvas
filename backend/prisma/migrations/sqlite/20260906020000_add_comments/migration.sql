-- Canvas comments: threads pinned to a point on a drawing, each holding one or
-- more comments. Access is the drawing's own access, so nothing extra is stored.

CREATE TABLE "CommentThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawingId" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME,
    "resolvedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommentThread_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommentThread_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CommentThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CommentThread_drawingId_resolved_idx" ON "CommentThread"("drawingId", "resolved");

CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentions" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "editedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommentThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Comment_threadId_createdAt_idx" ON "Comment"("threadId", "createdAt");
