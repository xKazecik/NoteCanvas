-- Set while the owner has taken the drawing offline. Other people's access is
-- capped at view until it is cleared; their share rows are left untouched.

ALTER TABLE "Drawing" ADD COLUMN "offlineAt" DATETIME;
