import "dotenv/config";

const AGENT_BRAIN_URL = process.env.AGENT_BRAIN_URL ?? "http://localhost:4000";
const EXPECTED_GRAPH = "coding";

async function getJson(path: string, init?: RequestInit) {
  const res = await fetch(`${AGENT_BRAIN_URL}${path}`, init);
  if (!res.ok) {
    throw new Error(`${path} returned HTTP ${res.status}`);
  }
  return res.json();
}

async function main() {
  console.log(`Checking LangGraph server at ${AGENT_BRAIN_URL}...`);

  // 1. Health endpoint.
  const ok = (await getJson("/ok")) as { ok?: boolean };
  console.log("/ok:", JSON.stringify(ok));
  if (ok.ok !== true) {
    throw new Error("LangGraph server did not report healthy (/ok)");
  }

  // 2. Info endpoint (reports flags and the loaded graph count).
  const info = (await getJson("/info")) as {
    flags?: Record<string, boolean>;
    graphs?: Record<string, unknown>;
  };
  console.log("/info flags:", JSON.stringify(info.flags ?? {}));

  // 3. Confirm the "coding" assistant/graph is registered.
  const search = (await getJson("/assistants/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph_id: EXPECTED_GRAPH, limit: 10, offset: 0 }),
  })) as Array<{ graph_id: string; assistant_id: string }>;

  const found = search.find((a) => a.graph_id === EXPECTED_GRAPH);
  console.log("Assistants:", search.map((a) => a.graph_id).join(", "));

  if (!found) {
    throw new Error(
      `Graph/assistant "${EXPECTED_GRAPH}" not found on the LangGraph server`,
    );
  }

  console.log(
    `✅ LangGraph server test passed (assistant "${EXPECTED_GRAPH}" is ready)`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(
    "❌ LangGraph server test failed:",
    e instanceof Error ? e.message : String(e),
  );
  process.exit(1);
});
