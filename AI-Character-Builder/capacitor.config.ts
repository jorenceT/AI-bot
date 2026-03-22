import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aicharacterbuilder.app',
  appName: 'AI Character Builder',
  webDir: 'dist/ai-chatbot',
  server: {
    androidScheme: 'https'
  }
};

export default config;
