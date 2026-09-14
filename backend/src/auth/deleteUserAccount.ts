import { PrismaClient } from "../generated/client";
import { deleteS3Object, isS3Enabled } from "../s3";

/**
 * Permanently removes a user and everything that belongs to them.
 *
 * Prisma cascades take care of the relational rows (drawings, collections,
 * shares, api keys, sessions). Drawing image blobs are the exception:
 * `DrawingFile` is keyed by drawingId without a foreign key, so its rows -- and
 * the S3 objects they point at -- have to be cleared here before the cascade
 * removes the drawings that named them.
 */
export const deleteUserAccount = async (
  prisma: PrismaClient,
  userId: string,
): Promise<void> => {
  const drawings = await prisma.drawing.findMany({
    where: { userId },
    select: { id: true },
  });
  const drawingIds = drawings.map((drawing) => drawing.id);

  if (drawingIds.length > 0) {
    if (isS3Enabled()) {
      const records = await prisma.drawingFile.findMany({
        where: { drawingId: { in: drawingIds } },
        select: { s3Key: true },
      });
      await Promise.allSettled(
        records
          .filter((record) => record.s3Key)
          .map((record) => deleteS3Object(record.s3Key as string)),
      );
    }
    await prisma.drawingFile.deleteMany({
      where: { drawingId: { in: drawingIds } },
    });
  }

  await prisma.user.delete({ where: { id: userId } });
};
