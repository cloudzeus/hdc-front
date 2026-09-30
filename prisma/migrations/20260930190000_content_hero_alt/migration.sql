-- Plan 8: the hero image of an article or guide gets its own alt text.
-- Additive: one nullable column.

-- AlterTable
ALTER TABLE "content_articles" ADD COLUMN "heroImageAlt" VARCHAR(300);
