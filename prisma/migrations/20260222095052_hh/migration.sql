-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "isCanceled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN     "usageCount" INTEGER DEFAULT 0,
ADD COLUMN     "valueScore" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isGuest" BOOLEAN NOT NULL DEFAULT false;
