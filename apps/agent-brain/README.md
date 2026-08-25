# agent-brain

Install dependencies from the repository root:

```bash
bun install
```

Start the LangGraph development server:

```bash
bun run --filter agent-brain langgraph:dev
```

The server loads `langgraph.json`, exposes the `coding` graph on `http://localhost:4000`, and uses Postgres for checkpointing. Set `DATABASE_URL`, `OPENAI_API_KEY`, and the Redis variables in `.env` before starting it.
