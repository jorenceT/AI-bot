import { Injectable } from '@angular/core';
import * as webllm from '@mlc-ai/web-llm';

export interface WebLLMProgress {
  progress: number;
  text: string;
  timeElapsed: number;
}

export interface WebLLMResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class WebLLMService {
  private engine: webllm.MLCEngine | null = null;
  private currentModel: string | null = null;
  private isLoading = false;
  private loadingProgress = 0;
  private loadingText = '';
  private onProgressCallback: ((progress: WebLLMProgress) => void) | null = null;

  // Available models - TinyLlama is the smallest and fastest
  private readonly availableModels: Record<string, string> = {
    'tinyllama': 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',
    'phi2': 'Phi-3-mini-4k-instruct-q4f16_1-MLC',
    'gemma': 'gemma-2-2b-it-q4f32_1-MLC',
    'llama': 'Llama-3.1-8B-Instruct-q4f32_1-MLC'
  };

  constructor() {}

  /**
   * Check if WebGPU is supported in the current browser
   */
  isWebGPUSupported(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  }

  /**
   * Get the current loading state
   */
  getLoadingState(): { isLoading: boolean; progress: number; text: string } {
    return {
      isLoading: this.isLoading,
      progress: this.loadingProgress,
      text: this.loadingText
    };
  }

  /**
   * Initialize the WebLLM engine with a specific model
   */
  async initializeModel(
    modelKey: string = 'tinyllama',
    onProgress?: (progress: WebLLMProgress) => void
  ): Promise<void> {
    if (!this.isWebGPUSupported()) {
      throw new Error('WebGPU is not supported in this browser. Please use Chrome or Edge with WebGPU enabled.');
    }

    const modelId = this.availableModels[modelKey];
    if (!modelId) {
      throw new Error(`Unknown model: ${modelKey}. Available models: ${Object.keys(this.availableModels).join(', ')}`);
    }

    // If already loaded with the same model, skip
    if (this.currentModel === modelId && this.engine) {
      return;
    }

    this.isLoading = true;
    this.loadingProgress = 0;
    this.loadingText = 'Initializing WebLLM...';
    this.onProgressCallback = onProgress || null;

    try {
      const startTime = Date.now();

      // Create engine with progress callback
      this.engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (report: webllm.InitProgressReport) => {
          const progress = Math.round((report.progress || 0) * 100);
          this.loadingProgress = progress;
          this.loadingText = report.text || 'Loading model...';
          
          if (this.onProgressCallback) {
            this.onProgressCallback({
              progress,
              text: this.loadingText,
              timeElapsed: Date.now() - startTime
            });
          }
        },
        logLevel: 'INFO'
      });

      this.currentModel = modelId;
      this.isLoading = false;
      this.loadingProgress = 100;
      this.loadingText = 'Model loaded successfully!';

      console.log(`WebLLM model ${modelId} loaded successfully`);
    } catch (error) {
      this.isLoading = false;
      this.loadingProgress = 0;
      this.loadingText = '';
      throw error;
    }
  }

  /**
   * Send a message and get a response
   */
  async sendMessage(
    message: string,
    systemPrompt: string = 'You are a helpful assistant.',
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
    }
  ): Promise<WebLLMResponse> {
    if (!this.engine) {
      throw new Error('WebLLM engine not initialized. Call initializeModel() first.');
    }

    const messages: webllm.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: message
      }
    ];

    try {
      const completion = await this.engine.chat.completions.create({
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 512,
        top_p: options?.topP ?? 0.9
      });

      const responseText = completion.choices[0]?.message?.content || '';
      
      return {
        text: responseText,
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens
        } : undefined
      };
    } catch (error) {
      console.error('WebLLM inference error:', error);
      throw error;
    }
  }

  /**
   * Stream a message response (for real-time text generation)
   */
  async *streamMessage(
    message: string,
    systemPrompt: string = 'You are a helpful assistant.',
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
    }
  ): AsyncGenerator<string, void, unknown> {
    if (!this.engine) {
      throw new Error('WebLLM engine not initialized. Call initializeModel() first.');
    }

    const messages: webllm.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: message
      }
    ];

    try {
      const chunks = await this.engine.chat.completions.create({
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 512,
        top_p: options?.topP ?? 0.9,
        stream: true
      });

      for await (const chunk of chunks) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('WebLLM streaming error:', error);
      throw error;
    }
  }

  /**
   * Check if a model is loaded
   */
  isModelLoaded(): boolean {
    return this.engine !== null && this.currentModel !== null;
  }

  /**
   * Get the currently loaded model name
   */
  getCurrentModel(): string | null {
    return this.currentModel;
  }

  /**
   * Get available model keys
   */
  getAvailableModels(): string[] {
    return Object.keys(this.availableModels);
  }

  /**
   * Unload the current model to free memory
   */
  async unloadModel(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
      this.currentModel = null;
      this.loadingProgress = 0;
      this.loadingText = '';
      console.log('WebLLM model unloaded');
    }
  }

  /**
   * Reset the engine (useful for clearing conversation context)
   */
  async resetEngine(): Promise<void> {
    if (this.engine) {
      await this.engine.resetChat();
      console.log('WebLLM engine reset');
    }
  }
}