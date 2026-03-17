-- AlterTable
ALTER TABLE "User" ADD COLUMN     "proAutoRenewing" BOOLEAN,
ADD COLUMN     "proPaymentState" INTEGER,
ADD COLUMN     "proPlanId" TEXT,
ADD COLUMN     "proProductId" TEXT,
ADD COLUMN     "proPurchaseToken" TEXT,
ADD COLUMN     "proUpdatedAt" TIMESTAMP(3);
