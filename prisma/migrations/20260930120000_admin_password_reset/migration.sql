-- CreateTable
CREATE TABLE "admin_password_resets" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestIp" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_password_reset_requests" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "ipAddress" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_password_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_password_resets_tokenHash_key" ON "admin_password_resets"("tokenHash");

-- CreateIndex
CREATE INDEX "admin_password_resets_adminUserId_idx" ON "admin_password_resets"("adminUserId");

-- CreateIndex
CREATE INDEX "admin_password_reset_requests_email_createdAt_idx" ON "admin_password_reset_requests"("email", "createdAt");

-- CreateIndex
CREATE INDEX "admin_password_reset_requests_ipAddress_createdAt_idx" ON "admin_password_reset_requests"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "admin_password_reset_requests_createdAt_idx" ON "admin_password_reset_requests"("createdAt");

-- AddForeignKey
ALTER TABLE "admin_password_resets" ADD CONSTRAINT "admin_password_resets_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
