/*
  Warnings:

  - You are about to alter the column `balance` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.

*/
-- CreateTable
CREATE TABLE "canonical_addresses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'mainnet',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "canonical_addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "address_variants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "address_variants_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "canonical_addresses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyHash" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "canonicalId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "amountNano" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmationDepth" INTEGER NOT NULL DEFAULT 0,
    "reorgSafe" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "deposits_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "canonical_addresses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "deposits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "amountNano" TEXT NOT NULL,
    "txHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    CONSTRAINT "withdrawals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telegramId" TEXT,
    "walletAddress" TEXT,
    "walletAddressVariants" TEXT NOT NULL DEFAULT '[]',
    "balance" INTEGER NOT NULL DEFAULT 0,
    "email" TEXT,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "canonicalAddressId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("balance", "createdAt", "id", "telegramId", "updatedAt", "walletAddress", "walletAddressVariants") SELECT "balance", "createdAt", "id", "telegramId", "updatedAt", "walletAddress", "walletAddressVariants" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_telegramId_idx" ON "User"("telegramId");
CREATE INDEX "User_walletAddress_idx" ON "User"("walletAddress");
CREATE INDEX "User_email_idx" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "canonical_addresses_address_key" ON "canonical_addresses"("address");

-- CreateIndex
CREATE INDEX "canonical_addresses_userId_idx" ON "canonical_addresses"("userId");

-- CreateIndex
CREATE INDEX "canonical_addresses_address_idx" ON "canonical_addresses"("address");

-- CreateIndex
CREATE UNIQUE INDEX "address_variants_variant_key" ON "address_variants"("variant");

-- CreateIndex
CREATE INDEX "address_variants_variant_idx" ON "address_variants"("variant");

-- CreateIndex
CREATE INDEX "address_variants_canonicalId_idx" ON "address_variants"("canonicalId");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_idempotencyHash_key" ON "deposits"("idempotencyHash");

-- CreateIndex
CREATE INDEX "deposits_txHash_idx" ON "deposits"("txHash");

-- CreateIndex
CREATE INDEX "deposits_userId_idx" ON "deposits"("userId");

-- CreateIndex
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

-- CreateIndex
CREATE INDEX "deposits_createdAt_idx" ON "deposits"("createdAt");

-- CreateIndex
CREATE INDEX "withdrawals_userId_idx" ON "withdrawals"("userId");

-- CreateIndex
CREATE INDEX "withdrawals_status_idx" ON "withdrawals"("status");

-- CreateIndex
CREATE INDEX "withdrawals_createdAt_idx" ON "withdrawals"("createdAt");

-- CreateIndex
CREATE INDEX "withdrawals_txHash_idx" ON "withdrawals"("txHash");
