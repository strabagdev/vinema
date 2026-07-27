import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NoteListItem } from "@/components/app-shell/note-list-item";
import type { Node } from "@/domain/node/node";
import {
  getNodeDetailPath,
  getNodeIdFromSearchParams,
} from "@/features/node/node-routes";

const note: Node = {
  id: "nota con espacios/and/symbols?",
  workspaceId: "workspace-1",
  type: "NOTE",
  content: "Contenido",
  status: "ACTIVE",
  organizationStatus: "ORGANIZED",
  metadata: {},
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  createdByDeviceId: "device-1",
  lastModifiedByDeviceId: "device-1",
};

describe("node routes", () => {
  it("builds an export-safe detail path with an encoded nodeId", () => {
    expect(getNodeDetailPath(note.id)).toBe(
      "/notes/detail?nodeId=nota%20con%20espacios%2Fand%2Fsymbols%3F",
    );
  });

  it("extracts a valid nodeId and rejects missing or empty params", () => {
    expect(
      getNodeIdFromSearchParams(
        new URLSearchParams("nodeId=nota%201") satisfies Pick<
          URLSearchParams,
          "get"
        >,
      ),
    ).toBe("nota 1");
    expect(getNodeIdFromSearchParams(new URLSearchParams())).toBeNull();
    expect(getNodeIdFromSearchParams(new URLSearchParams("nodeId=%20"))).toBeNull();
  });

  it("uses the export-safe detail path from note list links", () => {
    const element = NoteListItem({ node: note });

    expect(element.props.href).toBe(getNodeDetailPath(note.id));
  });

  it("does not keep the old dynamic note route workaround", () => {
    const source = [
      readSourceTree("src/app"),
      readSourceTree("src/components"),
      readSourceTree("src/features"),
    ].join("\n");
    const dynamicSegment = ["notes/", "[", "nodeId", "]"].join("");
    const fakeParam = ["__", "local", "__"].join("");
    const staticParamsFunction = ["generate", "Static", "Params"].join("");

    expect(source).not.toContain(dynamicSegment);
    expect(source).not.toContain(fakeParam);
    expect(source).not.toContain(staticParamsFunction);
  });
});

function readSourceTree(relativePath: string): string {
  const absolutePath = join(process.cwd(), relativePath);
  const stat = statSync(absolutePath);

  if (stat.isFile()) {
    return readFileSync(absolutePath, "utf8");
  }

  return readdirSync(absolutePath)
    .map((entry) => readSourceTree(join(relativePath, entry)))
    .join("\n");
}
