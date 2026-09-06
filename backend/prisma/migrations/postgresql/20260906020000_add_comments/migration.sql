-- Canvas comments: threads pinned to a point on a drawing, each holding one or
-- more comments. Access is the drawing's own access, so nothing extra is stored.

CREATE TABLE "CommentThread" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommentThread_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommentThread_drawingId_resolved_idx" ON "CommentThread"("drawingId", "resolved");

CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentions" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Comment_threadId_createdAt_idx" ON "Comment"("threadId", "createdAt");

ALTER TABLE "CommentThread" ADD CONSTRAINT "CommentThread_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentThread" ADD CONSTRAINT "CommentThread_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommentThread" ADD CONSTRAINT "CommentThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
