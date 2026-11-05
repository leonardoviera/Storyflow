-- CreateEnum
CREATE TYPE "ScriptSource" AS ENUM ('LLM', 'MANUAL');

-- CreateEnum
CREATE TYPE "TrackKind" AS ENUM ('VISUAL', 'OVERLAY_3D', 'TEXT', 'AUDIO');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'MODEL_3D', 'RENDER_3D', 'FONT', 'FINAL_RENDER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetSource" AS ENUM ('UPLOAD', 'BLENDER', 'RENDER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('SCRIPT_GENERATION', 'ASSET_3D', 'VIDEO_RENDER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "prompt" TEXT,
    "templateId" TEXT,
    "compositionId" TEXT NOT NULL DEFAULT 'StoryComposition',
    "width" INTEGER NOT NULL DEFAULT 1920,
    "height" INTEGER NOT NULL DEFAULT 1080,
    "fps" INTEGER NOT NULL DEFAULT 30,
    "durationInFrames" INTEGER NOT NULL DEFAULT 1,
    "currentScriptVersionId" TEXT,
    "timelineRevision" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" "ScriptSource" NOT NULL,
    "model" TEXT,
    "sourcePrompt" TEXT,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "scriptVersionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "narration" TEXT NOT NULL,
    "visualPrompt" TEXT NOT NULL,
    "durationInFrames" INTEGER NOT NULL,
    "asset3d" JSONB,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "TrackKind" NOT NULL,
    "order" INTEGER NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "sceneId" TEXT,
    "assetId" TEXT,
    "startFrame" INTEGER NOT NULL,
    "durationInFrames" INTEGER NOT NULL,
    "trimStartFrame" INTEGER NOT NULL DEFAULT 0,
    "props" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" "AssetKind" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "source" "AssetSource" NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT,
    "sha256" CHAR(64),
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "sourceJobId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "compositionId" TEXT NOT NULL,
    "defaultProps" JSONB NOT NULL,
    "thumbnailAssetId" TEXT,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "queueJobId" UUID,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Render" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "compositionId" TEXT NOT NULL,
    "inputProps" JSONB NOT NULL,
    "inputPropsHash" CHAR(64) NOT NULL,
    "codec" TEXT NOT NULL DEFAULT 'h264',
    "outputAssetId" TEXT,
    "renderMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Render_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_currentScriptVersionId_key" ON "Project"("currentScriptVersionId");

-- CreateIndex
CREATE INDEX "Project_archivedAt_updatedAt_idx" ON "Project"("archivedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScriptVersion_projectId_version_key" ON "ScriptVersion"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_scriptVersionId_order_key" ON "Scene"("scriptVersionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Track_projectId_order_key" ON "Track"("projectId", "order");

-- CreateIndex
CREATE INDEX "Clip_trackId_startFrame_idx" ON "Clip"("trackId", "startFrame");

-- CreateIndex
CREATE INDEX "Asset_projectId_kind_idx" ON "Asset"("projectId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_bucket_objectKey_key" ON "Asset"("bucket", "objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "Template_slug_key" ON "Template"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Job_queueJobId_key" ON "Job"("queueJobId");

-- CreateIndex
CREATE INDEX "Job_projectId_createdAt_idx" ON "Job"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Job_status_type_idx" ON "Job"("status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Render_jobId_key" ON "Render"("jobId");

-- CreateIndex
CREATE INDEX "Render_projectId_inputPropsHash_idx" ON "Render"("projectId", "inputPropsHash");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_currentScriptVersionId_fkey" FOREIGN KEY ("currentScriptVersionId") REFERENCES "ScriptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptVersion" ADD CONSTRAINT "ScriptVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_scriptVersionId_fkey" FOREIGN KEY ("scriptVersionId") REFERENCES "ScriptVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_thumbnailAssetId_fkey" FOREIGN KEY ("thumbnailAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Render" ADD CONSTRAINT "Render_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Render" ADD CONSTRAINT "Render_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Render" ADD CONSTRAINT "Render_outputAssetId_fkey" FOREIGN KEY ("outputAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
