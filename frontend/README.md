# Lecture Assistant Frontend

Professional React + TypeScript dashboard for the Lecture Assistant AI research system.

## Features

- 🎨 **Modern Blue Theme** - Professional design with Tailwind CSS
- 🔄 **Real-time Updates** - Auto-polling session status
- 🎯 **HITL Checkpoints** - Interactive human-in-the-loop review cards
- 📊 **Pipeline Visualization** - Track progress through all research stages
- 📝 **Rich Results View** - Markdown rendering, sources, claims, and logs
- 🚀 **Fast & Responsive** - Built with Vite for optimal performance

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **State Management**: Zustand
- **API Client**: Axios
- **Notifications**: React Hot Toast
- **Markdown**: React Markdown
- **Icons**: Lucide React

## Installation

```bash
# Install dependencies
npm install
```

## Development

```bash
# Start development server (runs on http://localhost:3000)
npm run dev
```

The dev server includes proxy configuration to forward `/api` requests to the FastAPI backend at `http://localhost:8000`.

## Backend Setup

Make sure the backend is running before starting the frontend:

```bash
# In the backend directory
uvicorn backend.main:app --reload
```

## Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Header.tsx
│   ├── NewSessionForm.tsx
│   ├── SessionCard.tsx
│   ├── PipelineProgress.tsx
│   ├── CheckpointCard.tsx
│   └── ResultsView.tsx
├── pages/               # Main page components
│   ├── Dashboard.tsx
│   └── SessionDetail.tsx
├── api.ts               # API service layer
├── store.ts             # Zustand state management
├── types.ts             # TypeScript type definitions
├── App.tsx              # Root component with routing
├── main.tsx             # Application entry point
└── index.css            # Global styles & Tailwind

```

## Key Components

### Dashboard
- Create new research sessions
- View all active and completed sessions
- Quick access to session details

### Session Detail
- **Pipeline Progress**: Visual tracking of all execution stages
- **Checkpoint Cards**: Interactive HITL review interfaces
  - Plan Review
  - Claims Verification
  - Tone/Focus Adjustment
- **Results View**: Tabbed interface for:
  - Final brief (Markdown)
  - Sources list
  - Extracted claims
  - Execution logs

### Checkpoint Types

1. **Plan Review**: Approve or revise research queries
2. **Claims Review**: Verify extracted claims with citations
3. **Tone Review**: Adjust tone/focus preferences

## API Integration

The frontend communicates with the FastAPI backend through:

- `POST /sessions/start` - Create new session
- `GET /sessions/{id}/status` - Poll session status
- `POST /sessions/{id}/feedback` - Submit checkpoint feedback
- `GET /sessions/{id}/result` - Get final results
- `GET /sessions/{id}/logs` - Get execution logs
- `GET /sessions` - List all sessions
- `DELETE /sessions/{id}` - Delete session

## Customization

### Theme Colors

Edit `tailwind.config.js` to customize the blue theme:

```js
colors: {
  primary: {
    500: '#3b82f6',  // Main blue
    600: '#2563eb',  // Darker blue
    // ... other shades
  },
}
```

### Polling Interval

Adjust status polling in `SessionDetail.tsx`:

```typescript
const interval = setInterval(loadStatus, 3000); // 3 seconds
```

## Environment

The frontend uses Vite's proxy configuration for API calls. No environment variables needed in development.

For production, configure your reverse proxy or API base URL in `src/api.ts`:

```typescript
const API_BASE_URL = process.env.VITE_API_URL || '/api';
```

## Browser Support

- Chrome/Edge (last 2 versions)
- Firefox (last 2 versions)
- Safari (last 2 versions)

## Contributing

1. Follow the existing code style
2. Use TypeScript strict mode
3. Add proper type definitions
4. Test all checkpoint interactions
5. Ensure responsive design works on mobile

## License

MIT

