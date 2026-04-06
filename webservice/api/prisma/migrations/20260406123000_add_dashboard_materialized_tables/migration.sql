-- CreateTable
CREATE TABLE "GraspDashboardTopicMetric" (
    "id" SERIAL NOT NULL,
    "readModelId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "uniqueSeedCount" INTEGER NOT NULL DEFAULT 0,
    "averageScore" DOUBLE PRECISION,
    "bestScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraspDashboardTopicMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraspDashboardActivityBucket" (
    "id" SERIAL NOT NULL,
    "readModelId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "uniqueSeedCount" INTEGER NOT NULL DEFAULT 0,
    "averageScore" DOUBLE PRECISION,
    "avgCpuUsage" DOUBLE PRECISION,
    "avgMemoryUsagePercent" DOUBLE PRECISION,
    "bestScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraspDashboardActivityBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraspDashboardResourceMetric" (
    "id" SERIAL NOT NULL,
    "readModelId" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "avgCpuUsage" DOUBLE PRECISION,
    "avgMemoryUsage" DOUBLE PRECISION,
    "avgMemoryUsagePercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraspDashboardResourceMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraspDashboardAlgorithmMetric" (
    "id" SERIAL NOT NULL,
    "readModelId" INTEGER NOT NULL,
    "summaryType" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "initialSeedCount" INTEGER NOT NULL DEFAULT 0,
    "finalSeedCount" INTEGER NOT NULL DEFAULT 0,
    "visibleOutcomeSeedCount" INTEGER NOT NULL DEFAULT 0,
    "visibleFinalSeedCount" INTEGER NOT NULL DEFAULT 0,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "avgScore" DOUBLE PRECISION,
    "avgGain" DOUBLE PRECISION,
    "bestSeedId" TEXT,
    "bestF1Score" DOUBLE PRECISION,
    "currentF1Score" DOUBLE PRECISION,
    "bestPayload" JSONB,
    "searches" TEXT[],
    "datasets" TEXT[],
    "rclAlgorithms" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraspDashboardAlgorithmMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GraspDashboardTopicMetric_readModelId_position_idx" ON "GraspDashboardTopicMetric"("readModelId", "position");

-- CreateIndex
CREATE INDEX "GraspDashboardTopicMetric_readModelId_topic_idx" ON "GraspDashboardTopicMetric"("readModelId", "topic");

-- CreateIndex
CREATE INDEX "GraspDashboardActivityBucket_readModelId_position_idx" ON "GraspDashboardActivityBucket"("readModelId", "position");

-- CreateIndex
CREATE INDEX "GraspDashboardActivityBucket_readModelId_timestamp_idx" ON "GraspDashboardActivityBucket"("readModelId", "timestamp");

-- CreateIndex
CREATE INDEX "GraspDashboardResourceMetric_readModelId_scope_position_idx" ON "GraspDashboardResourceMetric"("readModelId", "scope", "position");

-- CreateIndex
CREATE INDEX "GraspDashboardResourceMetric_readModelId_scope_label_idx" ON "GraspDashboardResourceMetric"("readModelId", "scope", "label");

-- CreateIndex
CREATE INDEX "GraspDashboardAlgorithmMetric_readModelId_summaryType_position_idx" ON "GraspDashboardAlgorithmMetric"("readModelId", "summaryType", "position");

-- CreateIndex
CREATE INDEX "GraspDashboardAlgorithmMetric_readModelId_summaryType_algorithm_idx" ON "GraspDashboardAlgorithmMetric"("readModelId", "summaryType", "algorithm");

-- AddForeignKey
ALTER TABLE "GraspDashboardTopicMetric" ADD CONSTRAINT "GraspDashboardTopicMetric_readModelId_fkey" FOREIGN KEY ("readModelId") REFERENCES "GraspDashboardReadModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraspDashboardActivityBucket" ADD CONSTRAINT "GraspDashboardActivityBucket_readModelId_fkey" FOREIGN KEY ("readModelId") REFERENCES "GraspDashboardReadModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraspDashboardResourceMetric" ADD CONSTRAINT "GraspDashboardResourceMetric_readModelId_fkey" FOREIGN KEY ("readModelId") REFERENCES "GraspDashboardReadModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraspDashboardAlgorithmMetric" ADD CONSTRAINT "GraspDashboardAlgorithmMetric_readModelId_fkey" FOREIGN KEY ("readModelId") REFERENCES "GraspDashboardReadModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
