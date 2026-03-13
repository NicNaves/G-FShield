-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('REQUESTED', 'RUNNING', 'COMPLETED', 'FAILED');

-- DropForeignKey
ALTER TABLE "Denuncia" DROP CONSTRAINT "Denuncia_enderecoId_fkey";

-- DropForeignKey
ALTER TABLE "Denuncia" DROP CONSTRAINT "Denuncia_userId_fkey";

-- DropForeignKey
ALTER TABLE "Foto" DROP CONSTRAINT "Foto_denunciaId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'ADMIN';

-- DropTable
DROP TABLE "Denuncia";

-- DropTable
DROP TABLE "Endereco";

-- DropTable
DROP TABLE "Foto";

-- DropEnum
DROP TYPE "Role";

-- CreateTable
CREATE TABLE "GraspExecutionLaunch" (
    "id" SERIAL NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'REQUESTED',
    "algorithms" TEXT[],
    "maxGenerations" INTEGER NOT NULL,
    "rclCutoff" INTEGER NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "datasetTrainingName" TEXT NOT NULL,
    "datasetTestingName" TEXT NOT NULL,
    "classifier" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraspExecutionLaunch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraspExecutionRun" (
    "id" SERIAL NOT NULL,
    "seedId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "stage" TEXT,
    "topic" TEXT,
    "rclAlgorithm" TEXT,
    "classifier" TEXT,
    "localSearch" TEXT,
    "neighborhood" TEXT,
    "trainingFileName" TEXT,
    "testingFileName" TEXT,
    "iterationNeighborhood" INTEGER,
    "iterationLocalSearch" INTEGER,
    "currentF1Score" DOUBLE PRECISION,
    "bestF1Score" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "precision" DOUBLE PRECISION,
    "recall" DOUBLE PRECISION,
    "cpuUsage" DOUBLE PRECISION,
    "memoryUsage" DOUBLE PRECISION,
    "memoryUsagePercent" DOUBLE PRECISION,
    "runningTime" TEXT,
    "solutionFeatures" JSONB,
    "rclFeatures" JSONB,
    "updates" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GraspExecutionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraspExecutionEvent" (
    "id" BIGSERIAL NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "topic" TEXT,
    "stage" TEXT,
    "status" "ExecutionStatus",
    "seedId" TEXT,
    "requestId" TEXT,
    "sourcePartition" INTEGER,
    "sourceOffset" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "launchId" INTEGER,
    "runId" INTEGER,

    CONSTRAINT "GraspExecutionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GraspExecutionLaunch_requestId_key" ON "GraspExecutionLaunch"("requestId");

-- CreateIndex
CREATE INDEX "GraspExecutionLaunch_requestedAt_idx" ON "GraspExecutionLaunch"("requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GraspExecutionRun_seedId_key" ON "GraspExecutionRun"("seedId");

-- CreateIndex
CREATE INDEX "GraspExecutionRun_updatedAt_idx" ON "GraspExecutionRun"("updatedAt");

-- CreateIndex
CREATE INDEX "GraspExecutionRun_status_idx" ON "GraspExecutionRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GraspExecutionEvent_fingerprint_key" ON "GraspExecutionEvent"("fingerprint");

-- CreateIndex
CREATE INDEX "GraspExecutionEvent_seedId_idx" ON "GraspExecutionEvent"("seedId");

-- CreateIndex
CREATE INDEX "GraspExecutionEvent_requestId_idx" ON "GraspExecutionEvent"("requestId");

-- CreateIndex
CREATE INDEX "GraspExecutionEvent_createdAt_idx" ON "GraspExecutionEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "GraspExecutionLaunch" ADD CONSTRAINT "GraspExecutionLaunch_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraspExecutionEvent" ADD CONSTRAINT "GraspExecutionEvent_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "GraspExecutionLaunch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraspExecutionEvent" ADD CONSTRAINT "GraspExecutionEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "GraspExecutionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
