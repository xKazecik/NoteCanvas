-- Collections can carry a colour so they stand out in the drawings panel.
-- NULL means the default card styling.

ALTER TABLE "Collection" ADD COLUMN "color" TEXT;
