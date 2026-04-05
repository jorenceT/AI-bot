# Quick Setup Guide

## Prerequisites Check
Run this command to verify your system is ready:

```bash
node --version
npm --version
```

You should have Node.js 18+ and npm 9+

## Step-by-Step Installation

### 1. Install Dependencies
```bash
cd "c:\coding\AI-Character-Builder"
npm install
```
This will download all required packages (~300+ MB). Wait for it to complete.

### 2. Get Hugging Face API Key
- Visit: https://huggingface.co/settings/tokens
- Sign up or sign in
- Click "New token"
- Copy the token (keep it safe!)

### 3. Start the Development Server
```bash
npm start
```

The app will automatically open at `http://localhost:4200`

### 4. Configure API Key
1. When the app loads, click the ⚙️ (settings) button in the top-right
2. Paste your Hugging Face API key in the dialog
3. Click "Save"

### 5. Start Chatting
1. Select a character from the list
2. Type a message in the input field
3. Press Enter or click Send
4. Wait for the AI response (may take 5-15 seconds on first request)

## File Structure Created

```
ai-chatbot/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── models/
│   │   │   │   └── ai.models.ts          # Data interfaces
│   │   │   └── services/
│   │   │       ├── ai.service.ts         # AI API communication
│   │   │       ├── character.service.ts  # Character management
│   │   │       └── chat.service.ts       # Chat history
│   │   ├── features/
│   │   │   └── chat/
│   │   │       ├── chat.component.ts
│   │   │       ├── chat.component.html
│   │   │       └── chat.component.scss
│   │   └── app.component.*
│   ├── assets/
│   │   └── characters/
│   │       └── characters-config.json   # Character definitions
│   ├── environments/                    # Config by environment
│   ├── main.ts                          # App entry point
│   ├── index.html
│   └── styles.scss                      # Global styles
├── angular.json                         # Angular CLI config
├── tsconfig.json                        # TypeScript config
├── package.json                         # Dependencies
├── README.md                            # Full documentation
└── .github/
    └── copilot-instructions.md          # Project instructions
```

## Available Commands

```bash
# Start development server
npm start

# Build for production
npm run build

# Run tests
npm test

# Watch mode (rebuild on file changes)
npm run watch
```

## Customizing Characters

Open `src/app/core/services/character.service.ts` and edit the `loadCharacters()` method:

```typescript
this.characters = [
  {
    id: 'your-id',
    name: 'Your Character',
    personality: 'your personality traits',
    tone: 'your tone',
    backstory: 'your backstory',
    systemPrompt: 'Your system prompt that guides the AI',
    isActive: false
  },
  // ... more characters
];
```

## Troubleshooting

### Command not found: npm
→ Node.js not installed. Download from nodejs.org

### Port 4200 already in use
→ Run: `npm start -- --port 4201`

### "API key not configured"
→ Click ⚙️ button and set your Hugging Face API key

### Slow responses
→ Normal for free tier. First request may take 10-30 seconds.

### White screen on startup
→ Wait 10 seconds, then refresh the page. Check browser console for errors.

## What's Included

✅ **Pre-built Components**
- Chat interface with message history
- Character selector
- API key management

✅ **Services**
- AI Service (Hugging Face API integration)
- Character Service (personality management)
- Chat Service (message history & persistence)

✅ **Features**
- Multiple character personalities
- Real-time chat
- Local storage persistence
- Responsive design

✅ **Configuration**
- TypeScript strict mode
- SCSS styling
- Path aliases for imports
- Optimized for development and production

## Next Steps

1. **Customize Characters** - Edit system prompts and personalities
2. **Change AI Model** - Use different Hugging Face models
3. **Add Features** - Implement export conversations, themes, etc.
4. **Deploy** - Build and deploy to your hosting service
5. **Enhance UI** - Add custom styling and themes

## Useful Resources

- **Angular**: https://angular.io/docs
- **Hugging Face API**: https://huggingface.co/docs/api-inference
- **Available Models**: https://huggingface.co/models?inference=text2text-generation
- **TypeScript**: https://www.typescriptlang.org/docs/

## Performance Tips

- First API request takes longer (model loading)
- Subsequent requests are faster
- Keep prompts concise for better performance
- Use simpler models if responses are too slow
- If you self-host large model shards (`params_shard_*.bin`), enable HTTP/2 or HTTP/3 plus Brotli on your CDN/server
- Serve shard files with long-lived immutable cache headers (for example `Cache-Control: public, max-age=31536000, immutable`)
- Keep shard files on the same origin as your app when possible, or add preconnect hints for the model CDN
- Avoid re-downloading by keeping filenames content-hashed and only changing them when model files actually change

## Security Notes

⚠️ **Store your API key safely!**
- Never commit API keys to version control
- Use environment variables in production
- Don't share your API key

## Support

If you encounter issues:
1. Check that Node.js is properly installed
2. Verify your Hugging Face API key is valid
3. Check browser console for error messages (F12)
4. Try clearing cache: Ctrl+Shift+Delete
5. Restart the development server

---

**Happy chatting! 🤖💬**
