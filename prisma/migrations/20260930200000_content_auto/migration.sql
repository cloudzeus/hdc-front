-- Automatic articles (spec docs/superpowers/specs/2026-09-30-auto-content-design.md §10).
-- Additive only: four enums, two tables, one column with a default.

-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "ContentTopicKind" AS ENUM ('MODEL', 'CATEGORY', 'NEW_PRODUCT', 'KEYWORD', 'QUERY');

-- CreateEnum
CREATE TYPE "ContentTopicStatus" AS ENUM ('PENDING', 'DONE', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContentRunOutcome" AS ENUM ('PUBLISHED', 'DRAFT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "content_articles" ADD COLUMN     "source" "ContentSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "content_topics" (
    "id" TEXT NOT NULL,
    "kind" "ContentTopicKind" NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ContentTopicStatus" NOT NULL DEFAULT 'PENDING',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "articleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_job_runs" (
    "id" TEXT NOT NULL,
    "topicId" TEXT,
    "trigger" VARCHAR(32) NOT NULL,
    "actor" VARCHAR(120),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "outcome" "ContentRunOutcome",
    "failedGates" JSONB NOT NULL DEFAULT '[]',
    "detail" JSONB,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "articleId" TEXT,
    "error" TEXT,

    CONSTRAINT "content_job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_topics_key_key" ON "content_topics"("key");

-- CreateIndex
CREATE INDEX "content_topics_status_pinned_score_idx" ON "content_topics"("status", "pinned", "score");

-- CreateIndex
CREATE INDEX "content_job_runs_startedAt_idx" ON "content_job_runs"("startedAt");

-- CreateIndex
CREATE INDEX "content_job_runs_outcome_startedAt_idx" ON "content_job_runs"("outcome", "startedAt");

-- AddForeignKey
ALTER TABLE "content_topics" ADD CONSTRAINT "content_topics_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "content_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_job_runs" ADD CONSTRAINT "content_job_runs_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "content_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_job_runs" ADD CONSTRAINT "content_job_runs_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "content_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
