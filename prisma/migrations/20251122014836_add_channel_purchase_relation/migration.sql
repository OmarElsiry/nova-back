-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Purchase" (
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
    CONSTRAINT "Purchase_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Purchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Purchase_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("buyerId", "channelId", "createdAt", "giftsVerified", "heldAmount", "id", "metadata", "ownershipVerified", "price", "refundedAt", "sellerId", "status", "updatedAt", "verificationDeadline", "verificationToken", "verifiedAt") SELECT "buyerId", "channelId", "createdAt", "giftsVerified", "heldAmount", "id", "metadata", "ownershipVerified", "price", "refundedAt", "sellerId", "status", "updatedAt", "verificationDeadline", "verificationToken", "verifiedAt" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE UNIQUE INDEX "Purchase_verificationToken_key" ON "Purchase"("verificationToken");
CREATE INDEX "Purchase_buyerId_idx" ON "Purchase"("buyerId");
CREATE INDEX "Purchase_sellerId_idx" ON "Purchase"("sellerId");
CREATE INDEX "Purchase_channelId_idx" ON "Purchase"("channelId");
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");
CREATE INDEX "Purchase_createdAt_idx" ON "Purchase"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
