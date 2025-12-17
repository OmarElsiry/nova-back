-- AlterTable: Add version field for optimistic locking
ALTER TABLE "User" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Change balance to Decimal for precision
ALTER TABLE "User" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(20,9);

-- AlterTable: Change price fields to Decimal
ALTER TABLE "Purchase" ALTER COLUMN "price" SET DATA TYPE DECIMAL(20,9);
ALTER TABLE "Purchase" ALTER COLUMN "heldAmount" SET DATA TYPE DECIMAL(20,9);

-- AlterTable: Change channel price to Decimal
ALTER TABLE "Channel" ALTER COLUMN "askingPrice" SET DATA TYPE DECIMAL(20,9);

-- AlterTable: Change transaction amount to Decimal
ALTER TABLE "Transaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(20,9);

-- CreateIndex: Add index on version field for performance
CREATE INDEX "User_version_idx" ON "User"("version");

-- Add check constraint to prevent negative balance
ALTER TABLE "User" ADD CONSTRAINT "User_balance_non_negative" CHECK ("balance" >= 0);
