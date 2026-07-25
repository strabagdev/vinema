import { NoteDetailClient } from "@/app/notes/[nodeId]/note-detail-client";

export function generateStaticParams() {
  return [{ nodeId: "__local__" }];
}

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ nodeId: string }>;
}) {
  const { nodeId } = await params;

  return <NoteDetailClient nodeId={nodeId} />;
}
