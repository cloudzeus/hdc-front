-- Plan 8, Part Δ: content articles, SEO overrides and manual redirects.
-- Additive only: three new tables and four enums.

-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('ARTICLE', 'GUIDE');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "SeoTargetType" AS ENUM ('CATEGORY', 'PLATFORM', 'MODEL', 'PRODUCT', 'PAGE');

-- CreateEnum
CREATE TYPE "RedirectSource" AS ENUM ('MANUAL');

-- CreateTable
CREATE TABLE "content_articles" (
    "id" TEXT NOT NULL,
    "kind" "ContentKind" NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(300) NOT NULL,
    "seoTitle" VARCHAR(200),
    "metaDescription" VARCHAR(400),
    "answer" TEXT,
    "body" TEXT NOT NULL,
    "faq" JSONB NOT NULL DEFAULT '[]',
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "entities" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "heroImageUrl" VARCHAR(1000),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" VARCHAR(120) NOT NULL,

    CONSTRAINT "content_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_overrides" (
    "id" TEXT NOT NULL,
    "targetType" "SeoTargetType" NOT NULL,
    "targetKey" VARCHAR(200) NOT NULL,
    "h1" VARCHAR(300),
    "seoTitle" VARCHAR(200),
    "metaDescription" VARCHAR(400),
    "intro" TEXT,
    "body" TEXT,
    "faq" JSONB,
    "keywords" JSONB,
    "entities" JSONB,
    "sources" JSONB,
    "relatedArticles" JSONB,
    "relatedCategories" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" VARCHAR(120) NOT NULL,

    CONSTRAINT "seo_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redirect_rules" (
    "id" TEXT NOT NULL,
    "fromPath" VARCHAR(512) NOT NULL,
    "toPath" VARCHAR(512) NOT NULL,
    "source" "RedirectSource" NOT NULL DEFAULT 'MANUAL',
    "hits" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(120) NOT NULL,

    CONSTRAINT "redirect_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_articles_slug_key" ON "content_articles"("slug");

-- CreateIndex
CREATE INDEX "content_articles_kind_status_publishedAt_idx" ON "content_articles"("kind", "status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "seo_overrides_targetType_targetKey_key" ON "seo_overrides"("targetType", "targetKey");

-- CreateIndex
CREATE UNIQUE INDEX "redirect_rules_fromPath_key" ON "redirect_rules"("fromPath");
