-- HDC shop baseline.
--
-- The Kolleris eshop this shop was copied from built its database partly by
-- hand: retail_registration_tokens and the trigram search indexes were never
-- in a migration, so its 39 migrations cannot build a clean database. The HDC
-- shop starts its own history here instead: the whole schema, generated with
-- `prisma migrate diff --from-empty --to-schema`, plus the hand-written search
-- SQL the schema cannot express (appended at the end, unchanged).

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('el', 'en', 'it');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'EDITOR', 'OPS');

-- CreateEnum
CREATE TYPE "ErpType" AS ENUM ('CATEGORY', 'GROUP', 'SUBGROUP');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'ON_DELIVERY');

-- CreateEnum
CREATE TYPE "ContactTopic" AS ENUM ('technical', 'quote', 'partnership', 'order', 'other');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('new', 'inProgress', 'answered', 'closed');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('individual', 'company');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('pending', 'active', 'suspended', 'rejected');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('owner', 'buyer', 'viewer');

-- CreateEnum
CREATE TYPE "OfferScope" AS ENUM ('products', 'brand', 'category');

-- CreateEnum
CREATE TYPE "OfferWidget" AS ENUM ('strip', 'card', 'marquee', 'countdown');

-- CreateEnum
CREATE TYPE "OfferDiscount" AS ENUM ('percent', 'amount', 'bogo', 'none');

-- CreateEnum
CREATE TYPE "SubscriberStatus" AS ENUM ('pending', 'confirmed', 'unsubscribed', 'bounced');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'sending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'EDITOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "sessionsValidFrom" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_role_capabilities" (
    "role" "AdminRole" NOT NULL,
    "capabilities" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "admin_role_capabilities_pkey" PRIMARY KEY ("role")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" VARCHAR(64) NOT NULL,
    "entity" VARCHAR(64) NOT NULL,
    "entityId" VARCHAR(64),
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "identifier" VARCHAR(320) NOT NULL,
    "ipAddress" VARCHAR(64),
    "successful" BOOLEAN NOT NULL DEFAULT false,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "code1" VARCHAR(64) NOT NULL,
    "code2" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "searchKey" TEXT NOT NULL,
    "mtrmark" INTEGER,
    "mtrcategory" INTEGER,
    "mtrgroup" INTEGER,
    "cccSubgroup2" INTEGER,
    "priceNet" DECIMAL(12,4),
    "priceList" DECIMAL(12,4),
    "vatRate" DECIMAL(5,2),
    "qty" DECIMAL(12,2),
    "qtyOnHand" DECIMAL(12,2),
    "qtyReserved" DECIMAL(12,2),
    "qtyIncoming" DECIMAL(12,2),
    "priceSyncedAt" TIMESTAMP(3),
    "width" DECIMAL(10,2),
    "length" DECIMAL(10,2),
    "height" DECIMAL(10,2),
    "weight" DECIMAL(10,3),
    "guaranteeMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "inStock" BOOLEAN NOT NULL DEFAULT false,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "onSale" BOOLEAN NOT NULL DEFAULT false,
    "erpInsertedAt" TIMESTAMP(3),
    "erpUpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstListedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ratingAvg" DECIMAL(3,2),
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "impaCode" VARCHAR(32),
    "variantGroup" VARCHAR(255),
    "isVariantLead" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "hdcId" TEXT NOT NULL,
    "erpCode" VARCHAR(32) NOT NULL,
    "erpType" "ErpType" NOT NULL,
    "parentId" TEXT,
    "slug" VARCHAR(140) NOT NULL,
    "nameEl" VARCHAR(255) NOT NULL,
    "nameEn" VARCHAR(255) NOT NULL,
    "nameIt" VARCHAR(255) NOT NULL,
    "mainImage" TEXT,
    "heroImage" TEXT,
    "iconImage" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "childCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "hdcId" TEXT NOT NULL,
    "mtrmark" INTEGER,
    "slug" VARCHAR(140) NOT NULL,
    "nameEl" VARCHAR(255) NOT NULL,
    "nameEn" VARCHAR(255) NOT NULL,
    "nameIt" VARCHAR(255) NOT NULL,
    "logo" TEXT,
    "image" TEXT,
    "isEshop" BOOLEAN NOT NULL DEFAULT false,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "inStockCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isFeature" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_colors" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalId" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_sizes" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalId" VARCHAR(64) NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "family" VARCHAR(120),
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_translations" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT,
    "longDescription" TEXT,
    "searchKey" TEXT NOT NULL,

    CONSTRAINT "product_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_specs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "fieldKey" VARCHAR(64) NOT NULL,
    "fieldGroup" VARCHAR(32) NOT NULL,
    "label" VARCHAR(128),
    "value" TEXT NOT NULL,
    "valueNumeric" DECIMAL(14,4),
    "unit" VARCHAR(16),
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_overrides" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "slugOverride" VARCHAR(140),
    "badges" JSONB,
    "editorialCopy" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "hideFromEshop" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redirects" (
    "id" TEXT NOT NULL,
    "fromPath" VARCHAR(512) NOT NULL,
    "toPath" VARCHAR(512) NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 301,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "id" TEXT NOT NULL,
    "channel" VARCHAR(64) NOT NULL,
    "cursor" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastStatus" "SyncRunStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "processed" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "removed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" VARCHAR(64) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "seq" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "customerId" TEXT,
    "shippingMethod" VARCHAR(32),
    "paymentMethod" VARCHAR(32),
    "couponCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_lines" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "addedPriceNet" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" VARCHAR(32) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "customerId" TEXT,
    "guestToken" VARCHAR(64) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(64) NOT NULL,
    "firstName" VARCHAR(120) NOT NULL,
    "lastName" VARCHAR(120) NOT NULL,
    "shipLine1" VARCHAR(255) NOT NULL,
    "shipLine2" VARCHAR(255),
    "shipCity" VARCHAR(120) NOT NULL,
    "shipPostcode" VARCHAR(16) NOT NULL,
    "shipRegion" VARCHAR(120),
    "shipAdminRegion" VARCHAR(120),
    "shipCountry" VARCHAR(2) NOT NULL DEFAULT 'GR',
    "wantsInvoice" BOOLEAN NOT NULL DEFAULT false,
    "companyName" VARCHAR(255),
    "vatNumber" VARCHAR(32),
    "taxOffice" VARCHAR(120),
    "companyTrade" VARCHAR(255),
    "billLine1" VARCHAR(255),
    "billCity" VARCHAR(120),
    "billPostcode" VARCHAR(16),
    "shippingMethod" VARCHAR(32) NOT NULL,
    "paymentMethod" VARCHAR(32) NOT NULL,
    "notes" TEXT,
    "subtotalNet" DECIMAL(12,2) NOT NULL,
    "subtotalGross" DECIMAL(12,2) NOT NULL,
    "shippingNet" DECIMAL(12,2) NOT NULL,
    "shippingGross" DECIMAL(12,2) NOT NULL,
    "paymentFeeNet" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentFeeGross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(12,2) NOT NULL,
    "totalGross" DECIMAL(12,2) NOT NULL,
    "savingsGross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippingQuote" JSONB,
    "vivaOrderCode" VARCHAR(64),
    "vivaTransactionId" VARCHAR(64),
    "paidAt" TIMESTAMP(3),
    "reservedUntil" TIMESTAMP(3),
    "acsVoucherNo" VARCHAR(64),
    "acsPickupDate" VARCHAR(10),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "reviewRequestedAt" TIMESTAMP(3),
    "vivaPaymentMethodId" INTEGER,
    "erpTrdr" INTEGER,
    "erpFindoc" INTEGER,
    "erpFincode" VARCHAR(32),
    "erpSeries" INTEGER,
    "erpResponse" JSONB,
    "erpPushedAt" TIMESTAMP(3),
    "erpError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" VARCHAR(64),
    "mtrl" INTEGER,
    "sku" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "brand" VARCHAR(255),
    "imageUrl" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitNet" DECIMAL(12,2) NOT NULL,
    "unitGross" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "offerTitle" VARCHAR(160),
    "vatRate" DECIMAL(5,2) NOT NULL,
    "lineNet" DECIMAL(12,2) NOT NULL,
    "lineGross" DECIMAL(12,2) NOT NULL,
    "weightKg" DECIMAL(10,3),

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "actor" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "topic" "ContactTopic" NOT NULL,
    "status" "ContactStatus" NOT NULL DEFAULT 'new',
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(64),
    "company" VARCHAR(255),
    "vatNumber" VARCHAR(32),
    "subject" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "orderRef" VARCHAR(32),
    "pagePath" VARCHAR(512),
    "locale" "Locale" NOT NULL DEFAULT 'el',
    "customerId" VARCHAR(64),
    "handledBy" VARCHAR(64),
    "handledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" VARCHAR(120) NOT NULL,
    "lastName" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(64),
    "accountType" "AccountType" NOT NULL DEFAULT 'individual',
    "status" "AccountStatus" NOT NULL DEFAULT 'active',
    "companyId" TEXT,
    "role" "CompanyRole",
    "spendLimit" DECIMAL(12,2),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "afm" VARCHAR(32) NOT NULL,
    "doy" VARCHAR(120),
    "profession" VARCHAR(255),
    "phone" VARCHAR(64),
    "billAddress" VARCHAR(255),
    "billCity" VARCHAR(120),
    "billPostcode" VARCHAR(16),
    "erpTrdr" INTEGER,
    "status" "AccountStatus" NOT NULL DEFAULT 'pending',
    "partnerFactor" DECIMAL(4,3),
    "creditLimit" DECIMAL(12,2),
    "creditUsed" DECIMAL(12,2),
    "approvedBy" VARCHAR(64),
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "customerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "firstName" VARCHAR(120) NOT NULL,
    "lastName" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(64),
    "line1" VARCHAR(255) NOT NULL,
    "line2" VARCHAR(255),
    "city" VARCHAR(120) NOT NULL,
    "postcode" VARCHAR(16) NOT NULL,
    "region" VARCHAR(120),
    "adminRegion" VARCHAR(120),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_registration_tokens" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "orderNumber" VARCHAR(32),
    "purpose" VARCHAR(16) NOT NULL DEFAULT 'register',
    "accountType" VARCHAR(16) NOT NULL DEFAULT 'individual',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retail_registration_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_invites" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "firstName" VARCHAR(120) NOT NULL,
    "lastName" VARCHAR(120) NOT NULL,
    "role" "CompanyRole" NOT NULL DEFAULT 'buyer',
    "spendLimit" DECIMAL(12,2),
    "companyId" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedBy" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(64) NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "hint" VARCHAR(8),
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "content_blocks" (
    "key" VARCHAR(64) NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_blocks_pkey" PRIMARY KEY ("key","locale")
);

-- CreateTable
CREATE TABLE "zone_widgets" (
    "id" TEXT NOT NULL,
    "zone" VARCHAR(64) NOT NULL,
    "type" VARCHAR(48) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "props" JSONB NOT NULL,
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zone_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grid_templates" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "columns" INTEGER NOT NULL DEFAULT 12,
    "rows" INTEGER NOT NULL DEFAULT 6,
    "cells" JSONB NOT NULL,
    "aspect" VARCHAR(12),
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grid_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "templateId" TEXT NOT NULL,
    "published" JSONB,
    "draft" JSONB,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" VARCHAR(120),
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banner_placements" (
    "zone" VARCHAR(64) NOT NULL,
    "bannerId" TEXT NOT NULL,
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banner_placements_pkey" PRIMARY KEY ("zone")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "titleEl" VARCHAR(160) NOT NULL,
    "titleEn" VARCHAR(160) NOT NULL DEFAULT '',
    "titleIt" VARCHAR(160) NOT NULL DEFAULT '',
    "descriptionEl" VARCHAR(400) NOT NULL DEFAULT '',
    "descriptionEn" VARCHAR(400) NOT NULL DEFAULT '',
    "descriptionIt" VARCHAR(400) NOT NULL DEFAULT '',
    "badge" VARCHAR(40),
    "href" VARCHAR(255) NOT NULL,
    "scope" "OfferScope" NOT NULL DEFAULT 'products',
    "productSlugs" TEXT[],
    "brandSlug" VARCHAR(140),
    "categorySlug" VARCHAR(140),
    "discount" "OfferDiscount" NOT NULL DEFAULT 'percent',
    "discountValue" DECIMAL(10,2),
    "bogoBuy" INTEGER,
    "bogoFree" INTEGER,
    "maxPerCustomer" INTEGER,
    "maxTotal" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "widget" "OfferWidget" NOT NULL DEFAULT 'strip',
    "image" TEXT,
    "imageWide" TEXT,
    "video" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "folder" VARCHAR(40) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER NOT NULL,
    "uploadedBy" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(200),
    "locale" "Locale" NOT NULL DEFAULT 'el',
    "status" "SubscriberStatus" NOT NULL DEFAULT 'pending',
    "source" VARCHAR(32) NOT NULL DEFAULT 'home',
    "confirmToken" VARCHAR(64),
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "consentIp" VARCHAR(64),
    "consentUserAgent" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "templateId" VARCHAR(64) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "preheader" VARCHAR(500) NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "renderedHtml" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "openedCount" INTEGER NOT NULL DEFAULT 0,
    "clickedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "statsSyncedAt" TIMESTAMP(3),
    "createdBy" VARCHAR(64),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "subscriberId" TEXT,
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(200),
    "messageId" VARCHAR(255),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failedReason" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_reviews" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" VARCHAR(64),
    "orderNumber" VARCHAR(64),
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(120),
    "body" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "moderationNote" VARCHAR(400),
    "moderatedAt" TIMESTAMP(3),
    "moderatedBy" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favourites" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favourites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_isActive_idx" ON "admin_users"("isActive");

-- CreateIndex
CREATE INDEX "admin_audit_log_entity_entityId_idx" ON "admin_audit_log"("entity", "entityId");

-- CreateIndex
CREATE INDEX "admin_audit_log_createdAt_idx" ON "admin_audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_identifier_attemptedAt_idx" ON "login_attempts"("identifier", "attemptedAt");

-- CreateIndex
CREATE INDEX "login_attempts_ipAddress_attemptedAt_idx" ON "login_attempts"("ipAddress", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "products_mtrl_key" ON "products"("mtrl");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_isActive_mtrcategory_mtrgroup_cccSubgroup2_idx" ON "products"("isActive", "mtrcategory", "mtrgroup", "cccSubgroup2");

-- CreateIndex
CREATE INDEX "products_isActive_mtrmark_idx" ON "products"("isActive", "mtrmark");

-- CreateIndex
CREATE INDEX "products_isActive_variantGroup_idx" ON "products"("isActive", "variantGroup");

-- CreateIndex
CREATE INDEX "products_isActive_priceNet_idx" ON "products"("isActive", "priceNet");

-- CreateIndex
CREATE INDEX "products_isActive_inStock_idx" ON "products"("isActive", "inStock");

-- CreateIndex
CREATE INDEX "products_isActive_onSale_idx" ON "products"("isActive", "onSale");

-- CreateIndex
CREATE INDEX "products_isActive_isNew_erpInsertedAt_idx" ON "products"("isActive", "isNew", "erpInsertedAt");

-- CreateIndex
CREATE INDEX "products_isActive_firstListedAt_idx" ON "products"("isActive", "firstListedAt");

-- CreateIndex
CREATE INDEX "products_erpUpdatedAt_idx" ON "products"("erpUpdatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "categories_hdcId_key" ON "categories"("hdcId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_erpType_order_idx" ON "categories"("erpType", "order");

-- CreateIndex
CREATE INDEX "categories_parentId_order_idx" ON "categories"("parentId", "order");

-- CreateIndex
CREATE INDEX "categories_erpType_productCount_idx" ON "categories"("erpType", "productCount");

-- CreateIndex
CREATE UNIQUE INDEX "brands_hdcId_key" ON "brands"("hdcId");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "brands_isEshop_productCount_idx" ON "brands"("isEshop", "productCount");

-- CreateIndex
CREATE INDEX "brands_mtrmark_idx" ON "brands"("mtrmark");

-- CreateIndex
CREATE INDEX "product_images_productId_order_idx" ON "product_images"("productId", "order");

-- CreateIndex
CREATE INDEX "product_colors_productId_order_idx" ON "product_colors"("productId", "order");

-- CreateIndex
CREATE INDEX "product_colors_name_idx" ON "product_colors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "product_colors_productId_externalId_key" ON "product_colors"("productId", "externalId");

-- CreateIndex
CREATE INDEX "product_sizes_productId_order_idx" ON "product_sizes"("productId", "order");

-- CreateIndex
CREATE INDEX "product_sizes_family_label_idx" ON "product_sizes"("family", "label");

-- CreateIndex
CREATE UNIQUE INDEX "product_sizes_productId_externalId_key" ON "product_sizes"("productId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "product_translations_productId_locale_key" ON "product_translations"("productId", "locale");

-- CreateIndex
CREATE INDEX "product_specs_fieldKey_valueNumeric_idx" ON "product_specs"("fieldKey", "valueNumeric");

-- CreateIndex
CREATE INDEX "product_specs_fieldKey_value_idx" ON "product_specs"("fieldKey", "value");

-- CreateIndex
CREATE UNIQUE INDEX "product_specs_productId_locale_fieldKey_key" ON "product_specs"("productId", "locale", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "product_overrides_productId_key" ON "product_overrides"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_overrides_slugOverride_key" ON "product_overrides"("slugOverride");

-- CreateIndex
CREATE UNIQUE INDEX "redirects_fromPath_key" ON "redirects"("fromPath");

-- CreateIndex
CREATE UNIQUE INDEX "sync_state_channel_key" ON "sync_state"("channel");

-- CreateIndex
CREATE INDEX "sync_runs_stateId_startedAt_idx" ON "sync_runs"("stateId", "startedAt");

-- CreateIndex
CREATE INDEX "webhook_deliveries_source_receivedAt_idx" ON "webhook_deliveries"("source", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "carts_token_key" ON "carts"("token");

-- CreateIndex
CREATE INDEX "carts_lastSeenAt_idx" ON "carts"("lastSeenAt");

-- CreateIndex
CREATE INDEX "carts_customerId_idx" ON "carts"("customerId");

-- CreateIndex
CREATE INDEX "cart_lines_cartId_idx" ON "cart_lines"("cartId");

-- CreateIndex
CREATE UNIQUE INDEX "cart_lines_cartId_productId_key" ON "cart_lines"("cartId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "orders_guestToken_key" ON "orders"("guestToken");

-- CreateIndex
CREATE UNIQUE INDEX "orders_vivaOrderCode_key" ON "orders"("vivaOrderCode");

-- CreateIndex
CREATE INDEX "orders_status_createdAt_idx" ON "orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_email_idx" ON "orders"("email");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE INDEX "orders_reservedUntil_idx" ON "orders"("reservedUntil");

-- CreateIndex
CREATE INDEX "order_lines_orderId_idx" ON "order_lines"("orderId");

-- CreateIndex
CREATE INDEX "order_status_history_orderId_createdAt_idx" ON "order_status_history"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "contact_messages_status_createdAt_idx" ON "contact_messages"("status", "createdAt");

-- CreateIndex
CREATE INDEX "contact_messages_topic_createdAt_idx" ON "contact_messages"("topic", "createdAt");

-- CreateIndex
CREATE INDEX "contact_messages_email_idx" ON "contact_messages"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_companyId_role_idx" ON "customers"("companyId", "role");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "companies_afm_key" ON "companies"("afm");

-- CreateIndex
CREATE INDEX "companies_status_createdAt_idx" ON "companies"("status", "createdAt");

-- CreateIndex
CREATE INDEX "companies_erpTrdr_idx" ON "companies"("erpTrdr");

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_token_key" ON "customer_sessions"("token");

-- CreateIndex
CREATE INDEX "customer_sessions_customerId_idx" ON "customer_sessions"("customerId");

-- CreateIndex
CREATE INDEX "customer_sessions_expiresAt_idx" ON "customer_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "customer_addresses_customerId_isDefault_idx" ON "customer_addresses"("customerId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "retail_registration_tokens_token_key" ON "retail_registration_tokens"("token");

-- CreateIndex
CREATE INDEX "retail_registration_tokens_email_idx" ON "retail_registration_tokens"("email");

-- CreateIndex
CREATE INDEX "retail_registration_tokens_expiresAt_idx" ON "retail_registration_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invites_token_key" ON "customer_invites"("token");

-- CreateIndex
CREATE INDEX "customer_invites_expiresAt_idx" ON "customer_invites"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invites_companyId_email_key" ON "customer_invites"("companyId", "email");

-- CreateIndex
CREATE INDEX "content_blocks_locale_idx" ON "content_blocks"("locale");

-- CreateIndex
CREATE INDEX "zone_widgets_zone_order_idx" ON "zone_widgets"("zone", "order");

-- CreateIndex
CREATE INDEX "banners_templateId_idx" ON "banners"("templateId");

-- CreateIndex
CREATE INDEX "banner_placements_bannerId_idx" ON "banner_placements"("bannerId");

-- CreateIndex
CREATE UNIQUE INDEX "offers_slug_key" ON "offers"("slug");

-- CreateIndex
CREATE INDEX "offers_isActive_endsAt_idx" ON "offers"("isActive", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_url_key" ON "media_assets"("url");

-- CreateIndex
CREATE INDEX "media_assets_kind_createdAt_idx" ON "media_assets"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_confirmToken_key" ON "newsletter_subscribers"("confirmToken");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_status_createdAt_idx" ON "newsletter_subscribers"("status", "createdAt");

-- CreateIndex
CREATE INDEX "campaigns_status_createdAt_idx" ON "campaigns"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_messageId_key" ON "campaign_recipients"("messageId");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaignId_openedAt_idx" ON "campaign_recipients"("campaignId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaignId_email_key" ON "campaign_recipients"("campaignId", "email");

-- CreateIndex
CREATE INDEX "product_reviews_productId_status_createdAt_idx" ON "product_reviews"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "product_reviews_status_createdAt_idx" ON "product_reviews"("status", "createdAt");

-- CreateIndex
CREATE INDEX "product_reviews_customerId_createdAt_idx" ON "product_reviews"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_reviews_productId_customerId_key" ON "product_reviews"("productId", "customerId");

-- CreateIndex
CREATE INDEX "favourites_customerId_createdAt_idx" ON "favourites"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "favourites_customerId_productId_key" ON "favourites"("customerId", "productId");

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_colors" ADD CONSTRAINT "product_colors_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_specs" ADD CONSTRAINT "product_specs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_overrides" ADD CONSTRAINT "product_overrides_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "sync_state"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invites" ADD CONSTRAINT "customer_invites_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "grid_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banner_placements" ADD CONSTRAINT "banner_placements_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "banners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "newsletter_subscribers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Search (from the eshop migration 20260726190000_add_search_trgm_indexes) ──
-- Search-as-you-type indexes.
--
-- The header suggest runs on every keystroke against `searchKey` with a
-- `contains`, which in Postgres is `LIKE '%…%'` — unindexable by a btree, so it
-- was a sequential scan over 5.305 products per character typed. Trigram GIN
-- indexes make an infix LIKE an index scan.
--
-- `pg_trgm` is also what will back fuzzy matching later ("κνιπεξ" → KNIPEX);
-- the extension is the prerequisite for both.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "products_searchKey_trgm_idx"
  ON "products" USING GIN ("searchKey" gin_trgm_ops);

-- Exact-code lookups take the fast path before any trigram work: a customer
-- pasting an SKU is the single most common search on a trade catalogue.
CREATE INDEX IF NOT EXISTS "products_code_idx"  ON "products" ("code");
CREATE INDEX IF NOT EXISTS "products_code1_idx" ON "products" ("code1");
CREATE INDEX IF NOT EXISTS "products_code2_idx" ON "products" ("code2");

CREATE INDEX IF NOT EXISTS "categories_nameEl_trgm_idx"
  ON "categories" USING GIN ("nameEl" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "brands_nameEl_trgm_idx"
  ON "brands" USING GIN ("nameEl" gin_trgm_ops);
