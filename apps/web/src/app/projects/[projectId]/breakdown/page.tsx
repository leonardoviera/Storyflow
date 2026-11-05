import { notFound } from "next/navigation";
import { getPrisma } from "@storyflow/db";
import { BreakdownScreen } from "@/components/breakdown/BreakdownScreen";

export const dynamic = "force-dynamic";

export default async function BreakdownPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getPrisma().project.findFirst({ where: { id: projectId, archivedAt: null, kind: "STANDARD" } });
  if (!project) notFound();
  return <BreakdownScreen projectId={project.id} title={project.title} />;
}
