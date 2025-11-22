# 🎓 Lecture Assistant

AI-powered research assistant that generates comprehensive lecture briefs using LangGraph with Human-in-the-Loop (HITL) quality control.

## Overview

Lecture Assistant is a full-stack application that automates the research and brief creation process for educators. It uses a multi-stage LangGraph pipeline with strategic human checkpoints to ensure quality, accuracy, and relevance.

### Key Features

- **🔬 Automated Research**: Web search, content extraction, and source prioritization
- **🤖 AI-Powered Synthesis**: LLM-driven outline and brief generation
- **✅ HITL Checkpoints**: Human review at critical stages (plan, claims, tone)
- **📊 Professional Dashboard**: Real-time pipeline tracking and results viewing
- **📝 Comprehensive Output**: Formatted briefs with citations, sources, and claims
- **📈 Full Logging**: Track every step with timestamps, inputs, and outputs

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                     │
│              http://localhost:3000                      │
│                                                         │
│  • Dashboard & Session Management                      │
│  • Real-time Pipeline Visualization                    │
│  • Interactive HITL Checkpoints                        │
│  • Results Viewer (Brief, Sources, Claims, Logs)      │
└─────────────────────────────────────────────────────────┘
                          │
                          │ REST API
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Backend (FastAPI)                     │
│              http://localhost:8000                      │
│                                                         │
│  • Session Management API                              │
│  • LangGraph Pipeline Orchestration                    │
│  • HITL Feedback Processing                            │
│  • Results & Logs Endpoints                            │
└─────────────────────────────────────────────────────────┘
                          │
                          │ LangGraph
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Research Pipeline                      │
│                                                         │
│  Input → Search Plan → Plan Review [HITL]             │
│    → Web Search → Extract → Prioritize                 │
│    → Claims Extract → Claims Review [HITL]             │
│    → Synthesize → Review [HITL]                        │
│    → Tone Review [HITL] → Final Brief → Format         │
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
lecture-assistant/
├── backend/                    # FastAPI + LangGraph backend
│   ├── main.py                # FastAPI application & API routes
│   ├── graph.py               # LangGraph pipeline definition
│   ├── research.py            # Web search via Tavily
│   ├── extract.py             # Content extraction & prioritization
│   ├── logging_utils.py       # Logging infrastructure
│   ├── llm_factory.py         # LLM initialization
│   ├── run.py                 # CLI runner
│   ├── prompts/               # LLM prompt templates
│   └── requirements.txt       # Python dependencies
│
├── frontend/                  # React + TypeScript frontend
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── pages/             # Page components
│   │   ├── api.ts             # API client
│   │   ├── store.ts           # State management
│   │   └── types.ts           # TypeScript types
│   ├── package.json
│   └── vite.config.ts
│
└── README.md                  # This file
```

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- OpenAI API key (or other LLM provider)
- Tavily API key (for web search)

### 1. Backend Setup

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cat > .env << EOF
OPENAI_API_KEY=your_openai_key_here
TAVILY_API_KEY=your_tavily_key_here
EOF

# Start the FastAPI server
uvicorn backend.main:app --reload
```

Backend will be available at: **http://localhost:8000**

API documentation: **http://localhost:8000/docs**

### 2. Frontend Setup

```bash
# Open new terminal, navigate to frontend
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend will be available at: **http://localhost:3000**

## Usage

### Via Dashboard (Recommended)

1. Open **http://localhost:3000** in your browser
2. Enter a lecture topic (e.g., "Quantum Computing Fundamentals")
3. Click "Start Research"
4. Monitor pipeline progress in real-time
5. Respond to HITL checkpoints when they appear:
   - **Plan Review**: Approve or revise research queries
   - **Claims Review**: Verify extracted facts and citations
   - **Tone Review**: Adjust tone/focus if needed
6. View final brief with sources and claims
7. Download as Markdown

### Via CLI

```bash
cd backend

# Run with interactive HITL
python -m backend.run --topic "Machine Learning Ethics"

# Non-interactive (auto-approve all checkpoints)
python -m backend.run --topic "Machine Learning Ethics" --non_interactive

# Save results to JSON
python -m backend.run --topic "Deep Learning" --save_json output.json
```

## Pipeline Stages

### 1. Input & Planning
- Accepts topic and parameters
- Generates search queries using LLM
- **HITL Checkpoint**: Review and refine search plan

### 2. Research Phase
- Web search via Tavily API
- Content extraction from URLs
- Authority-based source prioritization

### 3. Fact Extraction
- Extract key claims from sources
- Map claims to citations
- **HITL Checkpoint**: Verify claims accuracy

### 4. Synthesis
- Generate lecture outline from verified sources
- **HITL Checkpoint**: Review outline, provide feedback

### 5. Refinement
- Apply human feedback to outline
- **HITL Checkpoint**: Optional tone/focus adjustment

### 6. Final Output
- Generate comprehensive lecture brief
- Format as clean Markdown
- Include citations, sources, and teaching plan

## API Endpoints

### Sessions
- `POST /sessions/start` - Start new research session
- `GET /sessions` - List all sessions
- `GET /sessions/{id}/status` - Get session status
- `GET /sessions/{id}/result` - Get final results
- `GET /sessions/{id}/logs` - Get execution logs
- `DELETE /sessions/{id}` - Delete session

### Feedback
- `POST /sessions/{id}/feedback?checkpoint_type={type}` - Submit HITL feedback

### Health
- `GET /health` - Health check with environment info

## Configuration

### Backend Configuration

Edit `backend/llm_factory.py` to change LLM provider:

```python
def get_llm(model=None, temperature=0.2, seed=42):
    if model and model.startswith("ollama/"):
        # Use local Ollama
        return ChatOllama(model=model.split("/")[1])
    else:
        # Use OpenAI
        return ChatOpenAI(model=model or "gpt-4")
```

### Frontend Configuration

Edit `frontend/src/api.ts` to change API base URL:

```typescript
const API_BASE_URL = '/api';  // Development (uses proxy)
// const API_BASE_URL = 'http://your-api-domain.com';  // Production
```

## Logging

All pipeline execution logs are saved to `logs/` directory:

- `logs/input.jsonl`
- `logs/search_plan.jsonl`
- `logs/web_search.jsonl`
- `logs/extract.jsonl`
- `logs/synthesis.jsonl`
- `logs/final_brief.jsonl`
- etc.

Each log entry includes:
- Timestamp
- Node name
- Inputs
- Outputs
- Prompt used
- Model metadata
- Human decisions

## Compliance with Requirements

### ✅ Part 1: LangGraph Implementation
- All required nodes: Input, Search, Extract, Prioritize, Synthesize, Brief, Format
- Proper state management
- Deterministic seeds
- Separate prompts in files

### ✅ Part 2: Human-in-the-Loop (HITL)
- Plan Review checkpoint
- Fact Verification checkpoint
- Optional Tone/Focus adjustment
- Interactive options with consequences

### ✅ Part 3: Orchestration & Logging
- Comprehensive logging per node
- Timestamps, inputs, outputs, prompts, model settings
- Human decision tracking

### ⚠️ Part 4: Slides Points (Partially Implemented)
Current brief includes:
- Summary
- Key concepts
- Teaching plan
- Citations

Missing (can be added to prompts):
- Title section
- Key Findings with citations
- Risks (3 bullets)
- Further Reading (5-8 items)
- Optional appendix: node trace

## Development

### Backend Development

```bash
# Run tests
pytest

# Check code style
black backend/
flake8 backend/

# Type checking
mypy backend/
```

### Frontend Development

```bash
# Run linter
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

### Backend Deployment
- Deploy FastAPI with Gunicorn or Uvicorn
- Set environment variables for API keys
- Configure CORS for your frontend domain
- Use Redis for session storage (replace in-memory dict)

### Frontend Deployment
- Build: `npm run build`
- Deploy `dist/` folder to static hosting
- Configure API base URL for production
- Set up reverse proxy for `/api` routes

## Troubleshooting

**Backend won't start**
- Check API keys in `.env`
- Ensure Python 3.10+ is installed
- Verify all dependencies: `pip install -r requirements.txt`

**Frontend can't connect to backend**
- Verify backend is running on port 8000
- Check proxy configuration in `vite.config.ts`
- Check browser console for CORS errors

**HITL checkpoints not appearing**
- Ensure frontend is polling status
- Check session status via API: `GET /sessions/{id}/status`
- Verify checkpoint_data is not None

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with [LangChain](https://www.langchain.com/) and [LangGraph](https://langchain-ai.github.io/langgraph/)
- Web search powered by [Tavily](https://tavily.com/)
- UI components inspired by modern design systems

---

**Built with ❤️ for educators who want AI-assisted research with human oversight**
