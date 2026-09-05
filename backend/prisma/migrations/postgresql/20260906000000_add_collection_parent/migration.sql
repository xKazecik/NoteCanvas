-- Collections nest, so a collection can act as a folder holding other
-- collections. parentId is NULL for a root collection.
--
-- ON DELETE SET NULL backs up the delete route, which reparents children to the
-- deleted collection's own parent so a subtree is never lost with its folder.

ALTER TABLE "Collection" ADD COLUMN "parentId" TEXT;

ALTER TABLE "Collection"
  ADD CONSTRAINT "Collection_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Collection"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Collection_userId_parentId_idx" ON "Collection"("userId", "parentId");
