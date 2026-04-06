-- CreateTable
CREATE TABLE "GraspDashboardReadModel" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "bucketIntervalMs" INTEGER NOT NULL,
    "sourceEventCount" INTEGER NOT NULL DEFAULT 0,
    "sourceRunCount" INTEGER NOT NULL DEFAULT 0,
    "sourceMaxEventAt" TIMESTAMP(3),
    "sourceMaxRunAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraspDashboardReadModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GraspDashboardReadModel_key_key" ON "GraspDashboardReadModel"("key");

-- CreateIndex
CREATE INDEX "GraspDashboardReadModel_generatedAt_idx" ON "GraspDashboardReadModel"("generatedAt");
