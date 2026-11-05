import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Blender3dToolParams } from "@storyflow/shared/schemas";
import { getEnv } from "@storyflow/shared/env";

// research.md R8: route tool calls through LiteLLM's MCP gateway (MCP_ROUTE=litellm, default) or,
// if the pinned LiteLLM cannot proxy tools/call, straight to the Blender server (MCP_ROUTE=direct).

export const TOOL_TIMEOUT_MS = 320_000;

export interface BlenderToolOutput {
  objectKey: string;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
  width: number;
  height: number;
  frames: number;
}

export interface BlenderToolResult {
  outputs: BlenderToolOutput[];
  blenderVersion: string;
  renderMs: number;
}

export class BlenderToolError extends Error {
  constructor(message: string, public readonly code?: number) {
    super(message);
  }
}

async function connect(): Promise<{ client: Client; resolveName: (tool: string) => Promise<string> }> {
  const env = getEnv();
  const client = new Client({ name: "storyflow-pipeline-worker", version: "0.1.0" });
  if (env.MCP_ROUTE === "direct") {
    if (!env.BLENDER_MCP_DIRECT_URL) throw new Error("MCP_ROUTE=direct requires BLENDER_MCP_DIRECT_URL");
    await client.connect(new StreamableHTTPClientTransport(new URL(env.BLENDER_MCP_DIRECT_URL)));
    return { client, resolveName: async (tool) => tool };
  }
  const url = new URL("/mcp/", env.LITELLM_BASE_URL);
  await client.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: { "x-litellm-api-key": `Bearer ${env.LITELLM_API_KEY}`, Authorization: `Bearer ${env.LITELLM_API_KEY}` },
      },
    }),
  );
  // LiteLLM may prefix tool names with the server name (e.g. "blender_mcp-render_text_logo").
  return {
    client,
    resolveName: async (tool) => {
      const { tools } = await client.listTools();
      const match = tools.find((t) => t.name === tool || t.name.endsWith(`-${tool}`) || t.name.endsWith(`/${tool}`));
      if (!match) throw new BlenderToolError(`Tool ${tool} not exposed by LiteLLM MCP gateway`);
      return match.name;
    },
  };
}

function parseResult(res: Awaited<ReturnType<Client["callTool"]>>): BlenderToolResult {
  const structured = res.structuredContent as Record<string, unknown> | undefined;
  if (structured) {
    const value = "outputs" in structured ? structured : (structured.result as Record<string, unknown>);
    if (value && "outputs" in value) return value as unknown as BlenderToolResult;
  }
  const text = (res.content as { type: string; text?: string }[] | undefined)?.find((c) => c.type === "text")?.text;
  if (!text) throw new BlenderToolError("Blender tool returned no content");
  return JSON.parse(text) as BlenderToolResult;
}

/** Validates params (T017 schemas), calls the tool, returns the parsed result. */
export async function callBlenderTool(
  tool: string,
  params: Record<string, unknown>,
  ids: { projectId: string; outputId: string },
): Promise<BlenderToolResult> {
  const parsed = Blender3dToolParams.parse({ tool, params });
  const { client, resolveName } = await connect();
  try {
    const name = await resolveName(parsed.tool);
    const res = await client.callTool(
      { name, arguments: { ...parsed.params, projectId: ids.projectId, outputId: ids.outputId } },
      undefined,
      { timeout: TOOL_TIMEOUT_MS },
    );
    if (res.isError) {
      const text = (res.content as { type: string; text?: string }[]).map((c) => c.text ?? "").join("\n");
      throw new BlenderToolError(text || "Blender tool failed", text.includes("RENDER_TIMEOUT") ? -32001 : undefined);
    }
    return parseResult(res);
  } finally {
    await client.close().catch(() => undefined);
  }
}
