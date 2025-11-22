# 🚀 Quick Start Guide

Get your Lecture Assistant running in 5 minutes!

## Step 1: Backend Setup (2 minutes)

```bash
# Navigate to backend directory
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file with your API keys
cat > .env << EOF
OPENAI_API_KEY=sk-your-key-here
TAVILY_API_KEY=tvly-your-key-here
EOF

# Start the backend server
uvicorn backend.main:app --reload
```

✅ Backend running at: http://localhost:8000
📚 API docs at: http://localhost:8000/docs

## Step 2: Frontend Setup (2 minutes)

Open a **new terminal window**:

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

✅ Frontend running at: http://localhost:3000

## Step 3: Create Your First Brief (1 minute)

1. Open http://localhost:3000 in your browser
2. Enter a topic: **"Quantum Computing Fundamentals"**
3. Click **"Start Research"**
4. Watch the pipeline progress
5. Respond to checkpoints when prompted
6. View your AI-generated lecture brief!

## What You'll See

### 1. Dashboard

- Clean, professional interface
- New session form
- List of all your research sessions

### 2. Pipeline Progress

Real-time tracking through 16 stages:

- ✅ Input
- ✅ Search Plan
- ✅ Plan Draft
- ⏸️ Plan Review (HITL Checkpoint)
- ... and more

### 3. HITL Checkpoints

You'll review:

- **Research Plan**: Approve or adjust search queries
- **Claims**: Verify facts with citations
- **Tone**: Adjust for your audience

### 4. Final Results

Beautiful tabbed interface with:

- 📝 **Brief**: Formatted Markdown lecture plan
- 🔍 **Sources**: All prioritized research sources
- 📋 **Claims**: Extracted facts with citations
- 📊 **Logs**: Full execution timeline

## Getting API Keys

### OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Create new key
3. Copy to `.env` file

### Tavily API Key

1. Go to https://tavily.com/
2. Sign up for free account
3. Get API key from dashboard
4. Copy to `.env` file

## Troubleshooting

### Port Already in Use?

**Backend (8000):**

```bash
# Find and kill process
lsof -ti:8000 | xargs kill -9

# Or use different port
uvicorn backend.main:app --reload --port 8001
```

**Frontend (3000):**

```bash
# Vite will automatically suggest port 3001 if 3000 is taken
```

### Module Not Found?

**Backend:**

```bash
# Make sure you're in backend directory and venv is activated
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

**Frontend:**

```bash
# Make sure you're in frontend directory
cd frontend
npm install
```

### API Connection Failed?

1. Check backend is running: http://localhost:8000/health
2. Check browser console for errors
3. Verify proxy config in `frontend/vite.config.ts`

## Next Steps

- Try different topics
- Experiment with advanced settings (model, temperature, seed)
- Download briefs as Markdown
- Check the execution logs
- Customize the prompts in `backend/prompts/`

## Features to Explore

### Multiple Sessions

Run several research tasks simultaneously!

### Non-Interactive Mode

Skip HITL checkpoints for faster results:

```bash
cd backend
python -m backend.run --topic "AI Ethics" --non_interactive
```

### Save to JSON

Export full state for analysis:

```bash
python -m backend.run --topic "Deep Learning" --save_json results.json
```

### Custom Models

Use different LLMs by changing model parameter.

## Pro Tips

1. **Better Topics**: Be specific - "Introduction to Neural Networks for Beginners" > "AI"
2. **Plan Review**: Use constraints like "focus on practical applications" or "include recent 2024 research"
3. **Claims Review**: Flag outdated or unclear claims for better accuracy
4. **Tone Adjustment**: Try "beginner-friendly", "industry-focused", or "math-heavy"

## Need Help?

- Check the main [README.md](README.md) for detailed documentation
- Review API docs at http://localhost:8000/docs
- Check logs in `backend/logs/` directory
- Examine network tab in browser dev tools

---

**Happy researching! 🎓✨**
