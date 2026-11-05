import { notFound } from "next/navigation";
import { getPrisma } from "@storyflow/db";
import { Editor } from "@/components/Editor";
import type { Project } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getPrisma().project.findFirst({ where: { id: projectId, archivedAt: null } });
  if (!project) notFound();
  const initial: Project = { ...project, updatedAt: project.updatedAt.toISOString() };
  return <Editor initialProject={initial} />;
}
