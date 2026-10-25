-- CreateEnum
CREATE TYPE "SubscriptionChannel" AS ENUM ('TRIAL', 'T_MONEY', 'FLOOZ', 'CASH', 'OTHER');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_UPDATED';

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "subscriptionEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "channel" "SubscriptionChannel" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "activatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subscription_professionalId_idx" ON "Subscription"("professionalId");

-- CreateIndex
CREATE INDEX "Subscription_createdAt_idx" ON "Subscription"("createdAt");

-- CreateIndex
CREATE INDEX "Professional_subscriptionEndsAt_idx" ON "Professional"("subscriptionEndsAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Lancement : les pros déjà inscrits reçoivent 3 mois d'essai gratuits
UPDATE "Professional"
SET "subscriptionEndsAt" = NOW() + INTERVAL '3 months'
WHERE "subscriptionEndsAt" IS NULL;

INSERT INTO "Subscription" ("id", "professionalId", "months", "amount", "currency", "channel", "note", "startsAt", "endsAt")
SELECT 'trial_' || "id", "id", 3, 0, 'XOF', 'TRIAL', 'Essai gratuit de lancement', NOW(), "subscriptionEndsAt"
FROM "Professional";
