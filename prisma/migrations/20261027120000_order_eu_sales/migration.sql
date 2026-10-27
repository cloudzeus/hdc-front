-- EU sales with DHL — VIES check and intra-EU VAT exemption
-- (docs/superpowers/specs/2026-10-23-eu-sales-vies-vat-design.md §3.3).
-- Additive only: every existing order gets billCountry 'GR', vatMode
-- 'standard' and NULL in the rest, and behaves exactly as before.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "billCountry" VARCHAR(2) NOT NULL DEFAULT 'GR',
ADD COLUMN     "customerType" VARCHAR(16),
ADD COLUMN     "vatMode" VARCHAR(24) NOT NULL DEFAULT 'standard',
ADD COLUMN     "viesAddress" TEXT,
ADD COLUMN     "viesCheckedAt" TIMESTAMP(3),
ADD COLUMN     "viesConsultationNumber" VARCHAR(64),
ADD COLUMN     "viesName" VARCHAR(255),
ADD COLUMN     "viesValid" BOOLEAN;
