-- CreateTable
CREATE TABLE "GraspDashboardTimelineBucket" (
    "id" SERIAL NOT NULL,
    "readModelId" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "seedId" TEXT,
    "requestId" TEXT,
    "algorithm" TEXT,
    "position" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "latestScore" DOUBLE PRECISION,
    "averageScore" DOUBLE PRECISION,
    "bestScore" DOUBLE PRECISION,
    "avgCpuUsage" DOUBLE PRECISION,
    "avgMemoryUsagePercent" DOUBLE PRECISION,
    "stage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraspDashboardTimelineBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GraspDashboardTimelineBucket_readModelId_scope_position_idx" ON "GraspDashboardTimelineBucket"("readModelId", "scope", "position");

-- CreateIndex
CREATE INDEX "GraspDashboardTimelineBucket_readModelId_scope_label_idx" ON "GraspDashboardTimelineBucket"("readModelId", "scope", "label");

-- CreateIndex
CREATE INDEX "GraspDashboardTimelineBucket_readModelId_seedId_timestamp_idx" ON "GraspDashboardTimelineBucket"("readModelId", "seedId", "timestamp");

-- CreateIndex
CREATE INDEX "GraspDashboardTimelineBucket_readModelId_algorithm_timestamp_idx" ON "GraspDashboardTimelineBucket"("readModelId", "algorithm", "timestamp");

-- AddForeignKey
ALTER TABLE "GraspDashboardTimelineBucket" ADD CONSTRAINT "GraspDashboardTimelineBucket_readModelId_fkey" FOREIGN KEY ("readModelId") REFERENCES "GraspDashboardReadModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
