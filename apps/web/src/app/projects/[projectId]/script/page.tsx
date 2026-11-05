import { notFound } from "next/navigation";
import { getPrisma } from "@storyflow/db";
import { ScriptScreen } from "@/components/script/ScriptScreen";

export const dynamic = "force-dynamic";

export default async function ScriptPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getPrisma().project.findFirst({ where: { id: projectId, archivedAt: null, kind: "STANDARD" } });
  if (!project) notFound();
  return <ScriptScreen projectId={project.id} title={project.title} />;
}
