## Lecture-Assistant Agent (LangGraph + Human-in-the-Loop)

This project builds a Lecture-Assistant agent using LangGraph to orchestrate a graph that performs:

- **Research**: generate queries and gather sources via DuckDuckGo.
- **Synthesis**: create a structured lecture outline with citations.
- **Human-in-the-Loop**: interactive review step to approve or revise the outline.
- **Final Brief**: produce a 1-page teaching brief (summary, key concepts, plan, assessments, citations).

### Prerequisites

- Python 3.10+
- OpenAI API key (set environment variable `OPENAI_API_KEY`)

### Install

```bash
python -m venv .venv
. .venv/Scripts/activate  # Windows PowerShell
pip install -r requirements.txt
```

If using OpenAI:

```bash
$env:OPENAI_API_KEY="sk-..."  # PowerShell
```

### Run

Interactively:

```bash
python -m lecture_assistant.run --topic "Transformers for NLP"
```

Non-interactive (auto-approve outline) and save output JSON:

```bash
python -m lecture_assistant.run --topic "Graph Neural Networks" --non_interactive --save_json result.json
```

### How it works

- `lecture_assistant/graph.py`: Constructs a `StateGraph` with nodes:
  - `plan` → Generate 5 focused search queries.
  - `research` → Search web and collect sources/snippets.
  - `synthesize` → Draft lecture outline with objectives and citations.
  - `review` → Human review (CLI input). Type `approve` to proceed or provide feedback to revise.
  - `revise` → Apply human feedback and update the outline.
  - `brief` → Produce the final 1-page teaching brief.
- `lecture_assistant/research.py`: DuckDuckGo search utilities.
- `lecture_assistant/llm_factory.py`: Creates an LLM client for OpenAI.
- `lecture_assistant/run.py`: CLI entry point to invoke the graph.

### Environment tips

- If you prefer `.env`, create it in the repo root:

```
OPENAI_API_KEY=sk-...
```

`python-dotenv` will load it automatically when running the CLI.

### Notes

- The human-in-the-loop step is implemented via terminal input for simplicity. You can integrate richer UIs or LangGraph interrupt patterns if desired.
- Web results are titles, URLs, and snippets for fast iteration; you can extend with page fetching and content extraction if needed.


