/*
  Warnings:

  - You are about to drop the `deposits` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `withdrawals` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `email` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - Made the column `telegramId` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "deposits_createdAt_idx";

-- DropIndex
DROP INDEX "deposits_status_idx";

-- DropIndex
DROP INDEX "deposits_userId_idx";

-- DropIndex
DROP INDEX "deposits_txHash_idx";

-- DropIndex
DROP INDEX "deposits_idempotencyHash_key";

-- DropIndex
DROP INDEX "withdrawals_txHash_idx";

-- DropIndex
DROP INDEX "withdrawals_createdAt_idx";

-- DropIndex
DROP INDEX "withdrawals_status_idx";

-- DropIndex
DROP INDEX "withdrawals_userId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "deposits";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "withdrawals";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Deposit" (
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
    CONSTRAINT "Deposit_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "canonical_addresses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Withdrawal" (
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
    CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "channelId" INTEGER NOT NULL,
    "buyerId" INTEGER NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "heldAmount" REAL NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "verificationDeadline" DATETIME NOT NULL,
    "ownershipVerified" BOOLEAN NOT NULL DEFAULT false,
    "giftsVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" DATETIME,
    "refundedAt" DATETIME,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Purchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Purchase_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserWarning" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "description" TEXT NOT NULL,
    "relatedPurchaseId" INTEGER,
    "count" INTEGER NOT NULL DEFAULT 1,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserWarning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telegramId" TEXT NOT NULL,
    "walletAddress" TEXT,
    "walletAddressVariants" TEXT NOT NULL DEFAULT '[]',
    "balance" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'user',
    "canonicalAddressId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("balance", "canonicalAddressId", "createdAt", "id", "role", "telegramId", "updatedAt", "walletAddress", "walletAddressVariants") SELECT "balance", "canonicalAddressId", "createdAt", "id", "role", "telegramId", "updatedAt", "walletAddress", "walletAddressVariants" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
CREATE INDEX "User_telegramId_idx" ON "User"("telegramId");
CREATE INDEX "User_walletAddress_idx" ON "User"("walletAddress");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_idempotencyHash_key" ON "Deposit"("idempotencyHash");

-- CreateIndex
CREATE INDEX "Deposit_txHash_idx" ON "Deposit"("txHash");

-- CreateIndex
CREATE INDEX "Deposit_userId_idx" ON "Deposit"("userId");

-- CreateIndex
CREATE INDEX "Deposit_status_idx" ON "Deposit"("status");

-- CreateIndex
CREATE INDEX "Deposit_createdAt_idx" ON "Deposit"("createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_idx" ON "Withdrawal"("userId");

-- CreateIndex
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");

-- CreateIndex
CREATE INDEX "Withdrawal_createdAt_idx" ON "Withdrawal"("createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_txHash_idx" ON "Withdrawal"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_verificationToken_key" ON "Purchase"("verificationToken");

-- CreateIndex
CREATE INDEX "Purchase_buyerId_idx" ON "Purchase"("buyerId");

-- CreateIndex
CREATE INDEX "Purchase_sellerId_idx" ON "Purchase"("sellerId");

-- CreateIndex
CREATE INDEX "Purchase_channelId_idx" ON "Purchase"("channelId");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

-- CreateIndex
CREATE INDEX "Purchase_createdAt_idx" ON "Purchase"("createdAt");

-- CreateIndex
CREATE INDEX "UserWarning_userId_idx" ON "UserWarning"("userId");

-- CreateIndex
CREATE INDEX "UserWarning_isBanned_idx" ON "UserWarning"("isBanned");

-- CreateIndex
CREATE INDEX "UserWarning_createdAt_idx" ON "UserWarning"("createdAt");
