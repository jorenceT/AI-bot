import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, MediaResolution, Modality } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadLocalEnv(join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 8787);
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const PIPER_BASE_URL = normalizeUrl(process.env.PIPER_BASE_URL || '');
const APP_ID = (process.env.APP_ID || '').trim();
const APP_SECRET = (process.env.APP_SECRET || '').trim();
const MAX_GEMINI_REQUESTS_PER_MINUTE = 14;
const geminiRequestTimestamps = [];
const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
const DEFAULT_GEMINI_LIVE_TTS_MODEL = 'gemini-live-2.5-flash-preview';
const DEFAULT_GEMINI_LIVE_TTS_VOICE = 'Zephyr';

const server = createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'ai-character-builder-backend',
        time: new Date().toISOString(),
        features: {
          gemini: !!GEMINI_API_KEY,
          piper: !!PIPER_BASE_URL,
          appAuth: !!APP_ID && !!APP_SECRET
        }
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/gemini/chat') {
      if (!isAuthorized(req)) {
        return sendJson(res, 401, { error: 'Unauthorized app request.' });
      }
      return await handleGeminiChat(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/gemini/greeting') {
      if (!isAuthorized(req)) {
        return sendJson(res, 401, { error: 'Unauthorized app request.' });
      }
      return await handleGeminiGreeting(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/gemini/voice-profile') {
      if (!isAuthorized(req)) {
        return sendJson(res, 401, { error: 'Unauthorized app request.' });
      }
      return await handleGeminiVoiceProfile(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/gemini/character-persona') {
      if (!isAuthorized(req)) {
        return sendJson(res, 401, { error: 'Unauthorized app request.' });
      }
      return await handleGeminiCharacterPersona(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/gemini/live-tts') {
      if (!isAuthorized(req)) {
        return sendJson(res, 401, { error: 'Unauthorized app request.' });
      }
      return await handleGeminiLiveTts(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/piper/speak') {
      if (!isAuthorized(req)) {
        return sendJson(res, 401, { error: 'Unauthorized app request.' });
      }
      return await handlePiperSpeak(req, res);
    }

    return sendJson(res, 404, {
      error: 'Not found'
    });
  } catch (error) {
    console.error('Unhandled backend error', error);
    return sendJson(res, 500, {
      error: 'Internal server error'
    });
  }
});

server.on('error', error => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other backend process or change PORT in backend/.env.`);
    process.exit(1);
  }

  console.error('Backend server error', error);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`AI Character Builder backend listening on http://0.0.0.0:${PORT}`);
});

async function handleGeminiChat(req, res) {
  if (!GEMINI_API_KEY) {
    return sendJson(res, 400, {
      error: 'GEMINI_API_KEY is not configured on the backend.'
    });
  }

  const body = await readJsonBody(req);
  const text = String(body?.text || '').trim();
  const characterData = body?.characterData || {};

  if (!text) {
    return sendJson(res, 400, {
      error: 'text is required.'
    });
  }

  const systemPrompt = String(characterData.systemPrompt || 'You are a helpful assistant.');
  const prompt = `${systemPrompt}\n\nUser: ${text}`;

  try {
    const reply = await generateGeminiText(prompt, [DEFAULT_GEMINI_MODEL]);
    return sendJson(res, 200, {
      text: reply.slice(0, 1000)
    });
  } catch (error) {
    return handleFetchError(res, error, 'Gemini chat request failed.');
  }
}

async function handleGeminiGreeting(req, res) {
  if (!GEMINI_API_KEY) {
    return sendJson(res, 400, {
      error: 'GEMINI_API_KEY is not configured on the backend.'
    });
  }

  const body = await readJsonBody(req);
  const character = body?.character || {};
  const userName = String(body?.userName || '').trim();
  const recentTopics = Array.isArray(body?.recentTopics) ? body.recentTopics.map(item => String(item)) : [];

  if (!String(character?.name || '').trim()) {
    return sendJson(res, 400, {
      error: 'character.name is required.'
    });
  }

  const prompt = buildGreetingPrompt(character, userName, recentTopics);

  try {
    const greeting = await generateGeminiText(prompt, selectModelCandidates(body?.modelPreference));
    return sendJson(res, 200, {
      text: cleanGreetingText(greeting)
    });
  } catch (error) {
    return handleFetchError(res, error, 'Gemini greeting request failed.');
  }
}

async function handleGeminiVoiceProfile(req, res) {
  if (!GEMINI_API_KEY) {
    return sendJson(res, 400, {
      error: 'GEMINI_API_KEY is not configured on the backend.'
    });
  }

  const body = await readJsonBody(req);
  const character = body?.character || {};
  const availableVoices = Array.isArray(body?.availableVoices) ? body.availableVoices.slice(0, 50) : [];

  if (!String(character?.name || '').trim()) {
    return sendJson(res, 400, {
      error: 'character.name is required.'
    });
  }

  const prompt = [
    'You are helping choose the most natural browser speech synthesis voice for a roleplay character.',
    'Given the character and available browser voices, return only strict JSON with this shape:',
    '{"voiceHints":["..."],"langHints":["..."],"rate":1.0,"pitch":1.0,"volume":1.0}',
    'Rules:',
    '- voiceHints: 2 to 6 short substrings to match against voice names, most important first.',
    '- langHints: 1 to 3 language hints such as "en-US" or "en-GB".',
    '- rate must be between 0.85 and 1.12 for natural speech.',
    '- pitch must be between 0.85 and 1.18 for natural speech.',
    '- volume must be between 0.9 and 1.0.',
    '- Prefer warm, natural, human-sounding voices over robotic ones.',
    '- Use the available voice list to influence voiceHints.',
    '',
    `Character name: ${character.name}`,
    `Personality: ${character.personality || 'not provided'}`,
    `Tone: ${character.tone || 'not provided'}`,
    `Backstory: ${character.backstory || 'not provided'}`,
    `System prompt: ${character.systemPrompt || 'not provided'}`,
    `Available voices: ${JSON.stringify(availableVoices)}`
  ].join('\n');

  try {
    const responseText = await generateGeminiText(prompt, selectModelCandidates(body?.modelPreference));
    const parsed = extractJsonObject(responseText);
    if (!parsed) {
      return sendJson(res, 200, { profile: null });
    }

    return sendJson(res, 200, {
      profile: {
        voiceHints: Array.isArray(parsed.voiceHints) ? parsed.voiceHints.slice(0, 6).map(item => String(item)) : [],
        langHints: Array.isArray(parsed.langHints) ? parsed.langHints.slice(0, 3).map(item => String(item)) : [],
        rate: clampNumber(parsed.rate, 0.85, 1.12, 1),
        pitch: clampNumber(parsed.pitch, 0.85, 1.18, 1),
        volume: clampNumber(parsed.volume, 0.9, 1, 1)
      }
    });
  } catch (error) {
    return handleFetchError(res, error, 'Gemini voice profile request failed.');
  }
}

async function handleGeminiCharacterPersona(req, res) {
  if (!GEMINI_API_KEY) {
    return sendJson(res, 400, {
      error: 'GEMINI_API_KEY is not configured on the backend.'
    });
  }

  const body = await readJsonBody(req);
  const figure = body?.figure || {};
  const title = String(figure?.title || '').trim();
  const description = String(figure?.description || '').trim();
  const extract = String(figure?.extract || '').trim();

  if (!title) {
    return sendJson(res, 400, {
      error: 'figure.title is required.'
    });
  }

  const prompt = [
    'Return strict JSON only.',
    'Create a concise roleplay persona from this known figure.',
    'JSON keys: personality, tone, backstory, systemPrompt.',
    'Keep each field short and natural.',
    `Figure: ${title}`,
    `Description: ${description || 'not provided'}`,
    `Summary: ${limitText(extract || 'not provided', 900)}`
  ].join('\n');

  try {
    const responseText = await generateGeminiText(prompt, selectModelCandidates(body?.modelPreference));
    const parsed = extractJsonObject(responseText);
    return sendJson(res, 200, {
      persona: parsed
        ? {
            personality: String(parsed.personality || '').trim(),
            tone: String(parsed.tone || '').trim(),
            backstory: String(parsed.backstory || '').trim(),
            systemPrompt: String(parsed.systemPrompt || '').trim()
          }
        : null
    });
  } catch (error) {
    return handleFetchError(res, error, 'Gemini character persona request failed.');
  }
}

async function handlePiperSpeak(req, res) {
  const body = await readJsonBody(req);
  const text = String(body?.text || '').trim();
  const requestedEndpoint = normalizeUrl(body?.endpoint || '');
  const targetUrl = requestedEndpoint || PIPER_BASE_URL;

  if (!text) {
    return sendJson(res, 400, {
      error: 'text is required.'
    });
  }

  if (!targetUrl) {
    return sendJson(res, 400, {
      error: 'No Piper endpoint configured. Set PIPER_BASE_URL in backend/.env or provide endpoint in the request.'
    });
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return sendJson(res, response.status, {
        error: errorText || `Piper request failed (${response.status}).`
      });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    res.writeHead(200, {
      'Content-Type': response.headers.get('content-type') || 'audio/wav',
      'Content-Length': audioBuffer.length
    });
    res.end(audioBuffer);
  } catch (error) {
    return handleFetchError(res, error, 'Piper request failed.');
  }
}

async function handleGeminiLiveTts(req, res) {
  if (!GEMINI_API_KEY) {
    return sendJson(res, 400, {
      error: 'GEMINI_API_KEY is not configured on the backend.'
    });
  }

  const body = await readJsonBody(req);
  const text = String(body?.text || '').trim();
  const stylePrompt = String(body?.stylePrompt || '').trim();
  const voiceName = String(body?.voiceName || DEFAULT_GEMINI_LIVE_TTS_VOICE).trim() || DEFAULT_GEMINI_LIVE_TTS_VOICE;
  const model = String(body?.model || DEFAULT_GEMINI_LIVE_TTS_MODEL).trim() || DEFAULT_GEMINI_LIVE_TTS_MODEL;

  if (!text) {
    return sendJson(res, 400, {
      error: 'text is required.'
    });
  }

  try {
    enforceGeminiRateLimit();
    const audioBuffer = await generateGeminiLiveAudio({
      text,
      stylePrompt,
      voiceName,
      model
    });

    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': audioBuffer.length
    });
    res.end(audioBuffer);
  } catch (error) {
    return handleFetchError(res, error, 'Gemini live TTS request failed.');
  }
}

async function generateGeminiText(prompt, candidateModels = [DEFAULT_GEMINI_MODEL]) {
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      return await retryWithBackoff(async () => {
        enforceGeminiRateLimit();
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ]
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(errorText || `Gemini request failed (${response.status}).`);
          error.status = response.status;
          throw error;
        }

        const json = await response.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
          throw new Error('Gemini returned an empty response.');
        }

        return String(text);
      });
    } catch (error) {
      lastError = error;
      const shouldTryNextModel = error?.status === 400 || error?.status === 404 || String(error?.message || '').toLowerCase().includes('not found');
      if (!shouldTryNextModel) {
        break;
      }
    }
  }

  throw lastError || new Error('Gemini request failed.');
}

function isAuthorized(req) {
  if (!APP_ID || !APP_SECRET) {
    return true;
  }

  const requestAppId = String(req.headers['x-app-id'] || '').trim();
  const requestAppSecret = String(req.headers['x-app-secret'] || '').trim();
  return requestAppId === APP_ID && requestAppSecret === APP_SECRET;
}

function enforceGeminiRateLimit() {
  const now = Date.now();
  pruneGeminiRequestTimestamps(now);

  if (geminiRequestTimestamps.length >= MAX_GEMINI_REQUESTS_PER_MINUTE) {
    const retryAfterMs = Math.max(1000, 60000 - (now - geminiRequestTimestamps[0]));
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    throw new Error(`Gemini requests are limited to 14 per minute. Please try again in ${retryAfterSeconds}s.`);
  }

  geminiRequestTimestamps.push(now);
}

function pruneGeminiRequestTimestamps(now = Date.now()) {
  const cutoff = now - 60000;
  while (geminiRequestTimestamps.length && geminiRequestTimestamps[0] <= cutoff) {
    geminiRequestTimestamps.shift();
  }
}

function buildGreetingPrompt(character, userName, recentTopics) {
  return [
    'Write one short in-character greeting for a returning user.',
    'Sound like the character, not a generic assistant.',
    'No AI mention. No markdown. No quotes.',
    'Keep it natural and under 45 words.',
    `User: ${userName || 'friend'}`,
    `Character: ${character?.name || 'not provided'}`,
    `Tone: ${limitText(character?.tone || 'warm', 90)}`,
    `Personality: ${limitText(character?.personality || 'distinctive', 120)}`,
    `Prompt hint: ${limitText(character?.systemPrompt || '', 180) || 'none'}`,
    `Recent chat topics: ${recentTopics.length ? recentTopics.join(' | ') : 'none'}`
  ].join('\n');
}

function cleanGreetingText(text) {
  return String(text)
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

function extractJsonObject(rawText) {
  const cleaned = String(rawText || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clampNumber(value, min, max, fallback) {
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, num));
}

function selectModelCandidates(modelPreference) {
  return [DEFAULT_GEMINI_MODEL];
}

async function generateGeminiLiveAudio({ text, stylePrompt, voiceName, model }) {
  const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY
  });

  let session = null;
  let settled = false;
  let inlineMimeType = 'audio/L16;rate=24000';
  const audioChunks = [];

  const finalize = async (resolve, reject, error, result) => {
    if (settled) {
      return;
    }

    settled = true;

    if (session) {
      try {
        await session.close();
      } catch {
        // ignore close failures
      }
    }

    if (error) {
      reject(error);
      return;
    }

    resolve(result);
  };

  return await withTimeout(new Promise(async (resolve, reject) => {
    try {
      session = await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName
              }
            }
          }
        },
        callbacks: {
          onmessage: message => {
            try {
              const parts = message?.serverContent?.modelTurn?.parts || [];
              for (const part of parts) {
                const inlineData = part?.inlineData;
                if (inlineData?.data) {
                  audioChunks.push(inlineData.data);
                  if (inlineData.mimeType) {
                    inlineMimeType = inlineData.mimeType;
                  }
                }
              }

              if (message?.serverContent?.turnComplete) {
                if (!audioChunks.length) {
                  void finalize(resolve, reject, new Error('Gemini live TTS returned no audio.'));
                  return;
                }

                void finalize(resolve, reject, null, convertRawAudioToWav(audioChunks, inlineMimeType));
              }
            } catch (error) {
              void finalize(resolve, reject, error);
            }
          },
          onerror: event => {
            const error = new Error(event?.message || 'Gemini live TTS failed.');
            void finalize(resolve, reject, error);
          },
          onclose: event => {
            if (settled) {
              return;
            }

            if (audioChunks.length) {
              void finalize(resolve, reject, null, convertRawAudioToWav(audioChunks, inlineMimeType));
              return;
            }

            const error = new Error(event?.reason || 'Gemini live TTS connection closed before audio was returned.');
            void finalize(resolve, reject, error);
          }
        }
      });

      session.sendClientContent({
        turns: [buildGeminiLiveTtsPrompt(text, stylePrompt)],
        turnComplete: true
      });
    } catch (error) {
      await finalize(resolve, reject, error);
    }
  }), 20000, 'Gemini live TTS timed out.');
}

function buildGeminiLiveTtsPrompt(text, stylePrompt) {
  const trimmedStyle = limitText(stylePrompt, 700);
  const trimmedText = limitText(text, 1800);

  return [
    'Speak the provided reply exactly once.',
    'Do not add extra narration, labels, or stage directions.',
    trimmedStyle ? `Voice direction: ${trimmedStyle}` : 'Voice direction: Speak naturally, warmly, and clearly.',
    `Reply to speak: ${trimmedText}`
  ].join('\n');
}

function convertRawAudioToWav(rawChunks, mimeType) {
  const audioBuffers = rawChunks.map(chunk => Buffer.from(String(chunk || ''), 'base64'));
  const dataLength = audioBuffers.reduce((total, chunk) => total + chunk.length, 0);
  const options = parseRawAudioMimeType(mimeType);
  const header = createWavHeader(dataLength, options);
  return Buffer.concat([header, ...audioBuffers]);
}

function parseRawAudioMimeType(mimeType) {
  const [fileType, ...params] = String(mimeType || '').split(';').map(value => value.trim());
  const [, format] = fileType.split('/');
  const options = {
    numChannels: 1,
    sampleRate: 24000,
    bitsPerSample: 16
  };

  if (format && format.startsWith('L')) {
    const bitsPerSample = Number.parseInt(format.slice(1), 10);
    if (Number.isFinite(bitsPerSample)) {
      options.bitsPerSample = bitsPerSample;
    }
  }

  for (const param of params) {
    const [key, value] = param.split('=').map(item => item.trim());
    if (key === 'rate') {
      const sampleRate = Number.parseInt(value, 10);
      if (Number.isFinite(sampleRate)) {
        options.sampleRate = sampleRate;
      }
    }
  }

  return options;
}

function createWavHeader(dataLength, options) {
  const {
    numChannels,
    sampleRate,
    bitsPerSample
  } = options;

  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

async function retryWithBackoff(operation, maxRetries = 2) {
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isServiceUnavailableError(error) || attempt === maxRetries) {
        throw error;
      }

      const delayMs = 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
      await sleep(delayMs);
      attempt += 1;
    }
  }

  throw lastError;
}

async function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId = null;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function isServiceUnavailableError(error) {
  const status = error?.status;
  const message = String(error?.message || '').toLowerCase();
  return status === 503 || message.includes('503') || message.includes('unavailable');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function limitText(text, maxLength) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-App-Id,X-App-Secret');
}

function sendJson(res, statusCode, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text)
  });
  res.end(text);
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function handleFetchError(res, error, fallbackMessage) {
  const message = String(error?.message || fallbackMessage);
  console.error(message);
  const statusCode = error?.status === 429
    ? 429
    : (isServiceUnavailableError(error) ? 503 : 502);
  return sendJson(res, statusCode, {
    error: message || fallbackMessage
  });
}

function normalizeUrl(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function loadLocalEnv(envPath) {
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
