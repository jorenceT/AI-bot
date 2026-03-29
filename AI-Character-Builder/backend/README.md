# Backend

Small Node.js backend for the AI Character Builder app.

## Features

- `GET /health`
- `POST /api/gemini/chat`
- `POST /api/gemini/greeting`
- `POST /api/gemini/voice-profile`
- `POST /api/gemini/live-tts`
- `POST /api/piper/speak`

## Setup

1. Copy `.env.example` to `.env`
2. Set `GEMINI_API_KEY` if you want Gemini proxy routes
3. Set `PIPER_BASE_URL` if you want Piper proxying
4. Set `APP_ID` and `APP_SECRET` if you want simple app-level request gating
5. Start the server

```bash
npm start
```

Or from the repo root:

```bash
npm run backend:start
```

## Example requests

### Health

```bash
curl http://localhost:8787/health
```

### Gemini chat

```bash
curl -X POST http://localhost:8787/api/gemini/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"Hello\",\"characterData\":{\"systemPrompt\":\"You are a calm assistant.\"}}"
```

### Gemini greeting

```bash
curl -X POST http://localhost:8787/api/gemini/greeting ^
  -H "Content-Type: application/json" ^
  -d "{\"userName\":\"Jo\",\"character\":{\"name\":\"Bruce Lee\",\"tone\":\"disciplined and philosophical\"},\"recentTopics\":[\"training\",\"focus\"]}"
```

### Gemini voice profile

```bash
curl -X POST http://localhost:8787/api/gemini/voice-profile ^
  -H "Content-Type: application/json" ^
  -d "{\"character\":{\"name\":\"Monk\",\"tone\":\"calm\",\"personality\":\"wise\"},\"availableVoices\":[{\"name\":\"Google US English\",\"lang\":\"en-US\",\"default\":true}]}"
```

### Piper speech

```bash
curl -X POST http://localhost:8787/api/piper/speak ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"Hello from Piper\"}" --output sample.wav
```

### Gemini live TTS

```bash
curl -X POST http://localhost:8787/api/gemini/live-tts ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"Hey there\",\"voiceName\":\"Zephyr\",\"model\":\"gemini-live-2.5-flash-preview\"}" --output live.wav
```
