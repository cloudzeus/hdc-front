ALTER TABLE "products" ADD COLUMN "xmlCode" VARCHAR(64);
CREATE UNIQUE INDEX "products_xmlCode_key" ON "products"("xmlCode");
ALTER TABLE "order_lines" ADD COLUMN "xmlCode" VARCHAR(64);
