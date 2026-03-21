# AI Chatbot - Angular Project

A configurable AI chatbot built with Angular that supports multiple AI character personalities. Uses the free Hugging Face Inference API for AI capabilities.

## Features

✨ **Configurable AI Characters** - Switch between different AI personalities with unique traits
🤖 **Free AI Integration** - Uses Hugging Face Inference API (free tier)
💬 **Real-time Chat** - Interactive chat interface with message history
🎨 **Responsive Design** - Works on desktop and mobile devices
💾 **Local Storage** - Persists conversations and character preferences
⚙️ **Easy Configuration** - Simple JSON-based character configuration

## Preview Characters

1. **Helpful Assistant** - Professional and respectful
2. **Creative Muse** - Imaginative and playful
3. **Patient Teacher** - Educational and encouraging
4. **Tech Mentor** - Knowledgeable developer support

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Hugging Face API key (free from [huggingface.co](https://huggingface.co/settings/tokens))

## Installation

### Step 1: Install Node.js
If you don't have Node.js installed, download it from [nodejs.org](https://nodejs.org/)

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Start Development Server
```bash
npm start
```

The application will open in your browser at `http://localhost:4200`

## Setup

### Getting a Hugging Face API Key

1. Go to [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
2. Create a new account or sign in
3. Click "New token" to create an API key
4. Copy your API key
5. When you start the app, click the ⚙️ button and paste your API key

## Project Structure

```
src/
├── app/
│   ├── core/
│   │   ├── models/          # Data interfaces
│   │   │   └── ai.models.ts
│   │   └── services/        # Core services
│   │       ├── ai.service.ts          # AI API integration
│   │       ├── character.service.ts   # Character management
│   │       └── chat.service.ts        # Chat history & sessions
│   ├── features/
│   │   └── chat/            # Chat feature
│   │       ├── chat.component.ts
│   │       ├── chat.component.html
│   │       └── chat.component.scss
│   ├── app.component.*
│   └── app.config.ts
├── assets/
│   └── characters/          # Character configs (future expansion)
├── environments/            # Environment configs
└── styles.scss             # Global styles
```

## Core Services

### CharacterService
Manages AI character personalities and switching between them.

**Methods:**
- `getCharacters()` - Get all available characters
- `getActiveCharacter()` - Get currently active character
- `setActiveCharacter(id)` - Switch to a different character
- `addCharacter(character)` - Create a new custom character

### AIService
Handles communication with the Hugging Face API.

**Methods:**
- `setApiKey(key)` - Set your Hugging Face API key
- `sendMessage(text, characterId, characterData)` - Send user message and get AI response
- `getMessages()` - Observable of all messages

### ChatService
Manages chat sessions and message history.

**Methods:**
- `addMessage(message)` - Add a message to current session
- `createSession(characterId)` - Create a new chat session
- `switchCharacter(characterId)` - Switch to a character's session
- `clearCurrentSession()` - Clear message history

## Adding Custom Characters

Edit the `CharacterService` (src/app/core/services/character.service.ts) to add new characters:

```typescript
{
  id: 'custom-id',
  name: 'Character Name',
  personality: 'character traits',
  tone: 'communication style',
  backstory: 'character background',
  systemPrompt: 'System prompt for AI behavior',
  isActive: false
}
```

## Available AI Models

The app uses the **Mistral 7B Instruct** model by default (free tier). Other models available on Hugging Face:

- `mistralai/Mistral-7B-Instruct-v0.1` (Default)
- `meta-llama/Llama-2-7b-chat`
- `tiiuae/falcon-7b-instruct`

To change the model, update `AIService` in `src/app/core/services/ai.service.ts`

## Building for Production

```bash
npm run build
```

Build artifacts will be stored in the `dist/` directory.

## Troubleshooting

### "API key not configured"
Set your Hugging Face API key using the ⚙️ button in the app header.

### "Failed to get AI response"
- Check your API key is valid
- Ensure your Hugging Face account has sufficient quota
- Try again later (free tier has rate limits)

### App not responding
- Clear browser cache and local storage
- Restart the dev server: `npm start`

## Rate Limiting

The free Hugging Face tier has rate limiting. If responses are slow:
- Wait a few seconds between messages
- Consider upgrading to a paid plan for higher limits

## Tech Stack

- **Angular 17+** - Frontend framework
- **TypeScript** - Programming language
- **SCSS** - Styling
- **RxJS** - Reactive programming
- **Hugging Face API** - Free AI Backend

## License

MIT

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the code comments
3. Check Hugging Face API documentation: [huggingface.co/docs/api-inference](https://huggingface.co/docs/api-inference)

## Future Enhancements

- 📊 Character personality editor UI
- 💾 Export/import conversations
- 🔄 Multiple concurrent chat sessions per character
- 🎨 Custom UI themes
- 🌐 Multi-language support
- 📱 Progressive Web App (PWA) support
