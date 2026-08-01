import {
  createKnowledgeBackupFileName,
  parseKnowledgeBackupJson,
  serializeKnowledgeBackup,
  type KnowledgeBackup,
} from "@/features/knowledge-backup/knowledge-backup";

export function downloadKnowledgeBackup(
  backup: KnowledgeBackup,
  options: { fileName?: string; document?: Document; url?: typeof URL } = {},
) {
  const targetDocument = options.document ?? document;
  const targetUrl = options.url ?? URL;
  const blob = new Blob([serializeKnowledgeBackup(backup)], {
    type: "application/json;charset=utf-8",
  });
  const objectUrl = targetUrl.createObjectURL(blob);
  const link = targetDocument.createElement("a");

  link.href = objectUrl;
  link.download = options.fileName ?? createKnowledgeBackupFileName();
  link.rel = "noopener";
  targetDocument.body.appendChild(link);
  link.click();
  link.remove();
  targetUrl.revokeObjectURL(objectUrl);
}

export async function readKnowledgeBackupFile(file: File) {
  return parseKnowledgeBackupJson(await file.text());
}
