<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

## Angular AI Chatbot Project

### Project Overview
Building a configurable AI chatbot using Angular with free AI API integration (Hugging Face Inference API). The system supports multiple AI character personalities that can be configured and switched.

### Key Features
- Angular 17+ framework
- Hugging Face Inference API for free AI capabilities
- Configurable AI character system (personality, tone, backstory)
- Real-time chat interface
- Character persistence and switching
- Responsive design

### Tech Stack
- **Framework**: Angular 17+
- **UI**: Angular Material
- **AI**: Hugging Face Inference API (free tier)
- **State Management**: Angular Services
- **Styling**: SCSS/CSS

### Project Structure
```
src/
├── app/
│   ├── core/               # Core services and models
│   │   ├── services/       # AI, character, chat services
│   │   ├── models/         # Character, message models
│   │   └── interceptors/   # HTTP interceptors
│   ├── shared/             # Shared components and utilities
│   │   ├── components/     # Reusable components
│   │   └── pipes/          # Custom pipes
│   ├── features/
│   │   ├── chat/           # Chat feature module
│   │   ├── characters/     # Character management
│   │   └── config/         # Configuration module
│   ├── app.component.*
│   └── app.module.ts
├── assets/
│   ├── characters/         # Character configs
│   └── styles/            # Global styles
└── environments/          # Environment configs
```

### Development Workflow
1. Create Angular project with CLI
2. Install Material components
3. Create core services for AI and character management
4. Build chat interface components
5. Implement character configuration system
6. Integrate Hugging Face API
7. Add character switching and persistence
8. Test and deploy

### Important Setup Notes
- Hugging Face API key needs to be stored in environment variables
- Free tier has rate limiting (adjust delays as needed)
- Character configs stored in JSON format in assets folder
- Chat history stored in LocalStorage

### Styling
Using Angular Material for consistent, responsive UI design.
