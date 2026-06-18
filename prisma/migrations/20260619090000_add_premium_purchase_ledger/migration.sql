CREATE TABLE "PremiumPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "purchaseToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "autoRenewing" BOOLEAN,
    "paymentState" INTEGER,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PremiumPurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PremiumPurchase_store_externalId_key"
ON "PremiumPurchase"("store", "externalId");

CREATE INDEX "PremiumPurchase_userId_idx"
ON "PremiumPurchase"("userId");

CREATE INDEX "PremiumPurchase_expiresAt_idx"
ON "PremiumPurchase"("expiresAt");

ALTER TABLE "PremiumPurchase"
ADD CONSTRAINT "PremiumPurchase_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
