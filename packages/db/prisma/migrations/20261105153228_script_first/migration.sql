-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('STANDARD', 'EPISODE');

-- CreateEnum
CREATE TYPE "ScriptOrigin" AS ENUM ('PASTE', 'UPLOAD', 'GENERATED');

-- CreateEnum
CREATE TYPE "BreakdownStatus" AS ENUM ('RUNNING', 'READY', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AspectRatio" AS ENUM ('PORTRAIT_9_16', 'LANDSCAPE_16_9');

-- CreateEnum
CREATE TYPE "BibleAssetType" AS ENUM ('CHARACTER', 'SETTING', 'PROP');

-- AlterEnum
ALTER TYPE "AssetKind" ADD VALUE 'DOCUMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE 'SCRIPT_WRITE';
ALTER TYPE "JobType" ADD VALUE 'BREAKDOWN';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "builtRevision" INTEGER,
ADD COLUMN     "currentBreakdownId" TEXT,
ADD COLUMN     "episodeKey" TEXT,
ADD COLUMN     "kind" "ProjectKind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "parentProjectId" TEXT;

-- CreateTable
CREATE TABLE "ProjectScript" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "origin" "ScriptOrigin" NOT NULL,
    "sourceAssetId" TEXT,
    "idea" TEXT,
    "aspectRatio" "AspectRatio" NOT NULL DEFAULT 'PORTRAIT_9_16',
    "episodeSeconds" INTEGER NOT NULL DEFAULT 60,
    "episodeCount" INTEGER NOT NULL DEFAULT 1,
    "libraryImports" JSONB NOT NULL DEFAULT '[]',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Breakdown" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "BreakdownStatus" NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceLines" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "document" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Breakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "timelineRevision" INTEGER NOT NULL,
    "tracks" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryAsset" (
    "id" TEXT NOT NULL,
    "type" "BibleAssetType" NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "aliases" TEXT[],
    "description" TEXT NOT NULL,
    "variants" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectScript_projectId_key" ON "ProjectScript"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Breakdown_projectId_version_key" ON "Breakdown"("projectId", "version");

-- CreateIndex
CREATE INDEX "TimelineSnapshot_projectId_createdAt_idx" ON "TimelineSnapshot"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryAsset_type_name_key" ON "LibraryAsset"("type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_currentBreakdownId_key" ON "Project"("currentBreakdownId");

-- CreateIndex
CREATE INDEX "Project_kind_archivedAt_updatedAt_idx" ON "Project"("kind", "archivedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_parentProjectId_episodeKey_key" ON "Project"("parentProjectId", "episodeKey");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_parentProjectId_fkey" FOREIGN KEY ("parentProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_currentBreakdownId_fkey" FOREIGN KEY ("currentBreakdownId") REFERENCES "Breakdown"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectScript" ADD CONSTRAINT "ProjectScript_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectScript" ADD CONSTRAINT "ProjectScript_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Breakdown" ADD CONSTRAINT "Breakdown_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Breakdown" ADD CONSTRAINT "Breakdown_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineSnapshot" ADD CONSTRAINT "TimelineSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
