export const environment = {
  production: false,
  apiUrl: 'https://api-inference.huggingface.co',
  huggingfaceModel: 'mistralai/Mistral-7B-Instruct-v0.1',
  backendBaseUrl: 'http://localhost:8787',
  backendAppId: '',
  backendAppSecret: '',
  preferBackendAi: true,
  webllmLocalModelId: 'gemma-2-2b-it-q4f16_1-MLC',
  webllmLocalModelPath: 'assets/models/gemma2/2b/resolve/main',
  webllmLocalModelLibPath: 'assets/models/gemma2/2b/gemma-2-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm'
};
