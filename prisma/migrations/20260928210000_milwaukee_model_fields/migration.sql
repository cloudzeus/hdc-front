-- AlterTable
ALTER TABLE "products" ADD COLUMN     "isFuel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isOneKey" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "modelContent" VARCHAR(8),
ADD COLUMN     "modelRoot" VARCHAR(64),
ADD COLUMN     "platform" VARCHAR(8);

-- CreateIndex
CREATE INDEX "products_platform_idx" ON "products"("platform");

-- CreateIndex
CREATE INDEX "products_modelRoot_idx" ON "products"("modelRoot");
