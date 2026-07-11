/**
 * Multi-provider AI API keys (Groq, OpenAI, Gemini, OpenRouter, Mistral).
 * Shared by the main browser renderer and Settings.
 */
(function (global) {
  'use strict';

  const PROVIDER_DEFS = {
    groq: {
      id: 'groq',
      name: 'Groq',
      freeTier: true,
      signupUrl: 'https://console.groq.com/keys',
      keyPlaceholder: 'gsk_…',
      kind: 'openai',
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
      supportsImages: true,
      models: [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'llama-3.1-70b-versatile',
        'llama-3-70b-8192',
        'mixtral-8x7b-32768'
      ],
      visionModels: ['meta-llama/llama-4-scout-17b-16e-instruct']
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      signupUrl: 'https://platform.openai.com/api-keys',
      keyPlaceholder: 'sk-…',
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      supportsImages: true,
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      visionModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
    },
    gemini: {
      id: 'gemini',
      name: 'Google Gemini',
      signupUrl: 'https://aistudio.google.com/apikey',
      keyPlaceholder: 'AI…',
      kind: 'gemini',
      supportsImages: true,
      models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
      visionModels: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
    },
    openrouter: {
      id: 'openrouter',
      name: 'OpenRouter',
      signupUrl: 'https://openrouter.ai/keys',
      keyPlaceholder: 'sk-or-…',
      kind: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
      supportsImages: true,
      extraHeaders: {
        'HTTP-Referer': 'https://www.axis-browser.com',
        'X-Title': 'Axis Browser'
      },
      models: [
        'openai/gpt-4o-mini',
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.3-70b-instruct:free'
      ],
      visionModels: [
        'openai/gpt-4o-mini',
        'google/gemini-2.0-flash-exp:free',
        'google/gemini-2.0-flash-001'
      ]
    },
    mistral: {
      id: 'mistral',
      name: 'Mistral',
      signupUrl: 'https://console.mistral.ai/api-keys/',
      keyPlaceholder: '…',
      kind: 'openai',
      baseUrl: 'https://api.mistral.ai/v1/chat/completions',
      supportsImages: true,
      models: ['mistral-small-latest', 'mistral-large-latest'],
      visionModels: ['pixtral-large-latest', 'pixtral-12b-2409']
    }
  };

  function listProviderDefs() {
    return Object.values(PROVIDER_DEFS);
  }

  function getProviderDef(providerId) {
    const id = String(providerId || '').trim();
    return PROVIDER_DEFS[id] || null;
  }

  function createProviderId() {
    return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function sanitizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const provider = String(raw.provider || '').trim();
    const def = getProviderDef(provider);
    const apiKey = String(raw.apiKey || '').trim();
    if (!def || !apiKey) return null;
    const id = String(raw.id || '').trim() || createProviderId();
    const label = String(raw.label || '').trim().slice(0, 64);
    const model = String(raw.model || '').trim().slice(0, 120);
    return { id, provider, label, apiKey, model };
  }

  /** Normalize settings; migrates legacy `groqApiKey` into `aiProviders`. */
  function normalizeSettings(settings) {
    const s = settings && typeof settings === 'object' ? settings : {};
    const rawList = Array.isArray(s.aiProviders) ? s.aiProviders : [];
    const aiProviders = rawList.map(sanitizeEntry).filter(Boolean);
    let activeAiProviderId = String(s.activeAiProviderId || '').trim() || null;

    if (!aiProviders.length) {
      const legacy = String(s.groqApiKey || '').trim();
      if (legacy) {
        const id = createProviderId();
        aiProviders.push({ id, provider: 'groq', label: 'Groq', apiKey: legacy, model: '' });
        activeAiProviderId = id;
      }
    }

    if (activeAiProviderId && !aiProviders.some((p) => p.id === activeAiProviderId)) {
      activeAiProviderId = aiProviders[0]?.id || null;
    }
    if (!activeAiProviderId && aiProviders.length) {
      activeAiProviderId = aiProviders[0].id;
    }

    return { aiProviders, activeAiProviderId };
  }

  function getActiveEntry(settings) {
    const { aiProviders, activeAiProviderId } = normalizeSettings(settings);
    if (!aiProviders.length) return null;
    return aiProviders.find((p) => p.id === activeAiProviderId) || aiProviders[0];
  }

  function maskApiKey(key, providerId) {
    const k = String(key || '').trim();
    if (!k) return '';
    const def = getProviderDef(providerId);
    const hint = def?.keyPlaceholder || '…';
    const prefixHint = hint.replace(/…+$/, '').replace(/\.\.\.$/, '');
    const prefix =
      prefixHint && k.toLowerCase().startsWith(prefixHint.toLowerCase())
        ? k.slice(0, prefixHint.length)
        : k.slice(0, Math.min(4, k.length));
    const suffix = k.slice(-4);
    const hiddenLen = Math.max(k.length - prefix.length - 4, 6);
    const dots = '•'.repeat(Math.min(hiddenLen, 18));
    return prefix + dots + suffix;
  }

  function messageHasImages(msg) {
    return !!(msg && Array.isArray(msg.images) && msg.images.length);
  }

  function conversationHasImages(messages) {
    return (Array.isArray(messages) ? messages : []).some(messageHasImages);
  }

  function providerSupportsImages(entry) {
    const def = getProviderDef(entry?.provider);
    return !!(def?.supportsImages && Array.isArray(def.visionModels) && def.visionModels.length);
  }

  function pickModelsForRequest(def, entry, messages) {
    const hasImages = conversationHasImages(messages);
    const visionModels = Array.isArray(def.visionModels) ? def.visionModels : [];
    const textModels = Array.isArray(def.models) ? def.models : [];
    const custom = String(entry?.model || '').trim();
    if (hasImages && visionModels.length) {
      if (custom) {
        if (visionModels.includes(custom)) {
          return [custom, ...visionModels.filter((m) => m !== custom)];
        }
        return [...visionModels, custom];
      }
      return visionModels.slice();
    }
    if (custom) return [custom, ...textModels.filter((m) => m !== custom)];
    return textModels.slice();
  }

  function imageDataUrl(img) {
    if (!img || typeof img !== 'object') return '';
    if (img.dataUrl) return String(img.dataUrl);
    const mime = String(img.mimeType || 'image/jpeg');
    const base64 = String(img.base64 || '').trim();
    return base64 ? `data:${mime};base64,${base64}` : '';
  }

  function toOpenAiMessage(msg) {
    const role = msg.role;
    if (role === 'system') {
      return { role, content: String(msg.content || '') };
    }
    const text = String(msg.content || '');
    const images = Array.isArray(msg.images) ? msg.images : [];
    if (!images.length) {
      return { role, content: text };
    }
    const parts = [];
    if (text.trim()) parts.push({ type: 'text', text });
    images.forEach((img) => {
      const url = imageDataUrl(img);
      if (url) parts.push({ type: 'image_url', image_url: { url } });
    });
    if (!parts.length && text) parts.push({ type: 'text', text });
    if (!parts.length) parts.push({ type: 'text', text: 'Describe this image.' });
    return { role, content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts };
  }

  function toGeminiParts(msg) {
    const text = String(msg.content || '');
    const images = Array.isArray(msg.images) ? msg.images : [];
    const parts = [];
    if (text.trim()) parts.push({ text });
    images.forEach((img) => {
      const base64 = String(img.base64 || '').trim();
      if (!base64 && img.dataUrl) {
        const match = String(img.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inline_data: { mime_type: match[1], data: match[2] }
          });
          return;
        }
      }
      if (base64) {
        parts.push({
          inline_data: {
            mime_type: String(img.mimeType || 'image/jpeg'),
            data: base64
          }
        });
      }
    });
    if (!parts.length) parts.push({ text: text || ' ' });
    return parts;
  }

  function displayName(entry) {
    if (!entry) return 'API key';
    const def = getProviderDef(entry.provider);
    const base = def?.name || entry.provider || 'Provider';
    const label = String(entry.label || '').trim();
    if (!label) return base;
    if (label.toLowerCase() === base.toLowerCase()) return base;
    if (label.toLowerCase() === String(entry.provider || '').toLowerCase()) return base;
    return `${label} · ${base}`;
  }

  async function openAiCompatibleChat(def, entry, messages, options) {
    const apiKey = String(entry.apiKey || '').trim();
    const models = pickModelsForRequest(def, entry, messages);
    const maxTokens = options.maxTokens ?? 2048;
    const temperature = options.temperature ?? 0.7;
    const hasImages = conversationHasImages(messages);
    let lastError = 'Unknown error';
    const apiMessages = messages.map(toOpenAiMessage);

    for (const model of models) {
      try {
        const res = await fetch(def.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...(def.extraHeaders || {})
          },
          body: JSON.stringify({
            model,
            messages: apiMessages,
            max_tokens: maxTokens,
            temperature
          })
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content || '';
          if (String(text).trim()) return String(text).trim();
          lastError = 'Empty response';
          continue;
        }
        const err = await res.json().catch(() => ({}));
        lastError = err.error?.message || err.message || `HTTP ${res.status}`;
      } catch (e) {
        lastError = e?.message || String(e);
      }
    }
    if (hasImages) {
      throw new Error(
        `${def.name} could not read your image(s). Try a smaller image, or pick a vision-capable model in Settings → AI Chat. (${lastError})`
      );
    }
    throw new Error(`${def.name} error: ${lastError}`);
  }

  async function geminiChat(def, entry, messages, options) {
    const apiKey = String(entry.apiKey || '').trim();
    const models = pickModelsForRequest(def, entry, messages);
    const maxTokens = options.maxTokens ?? 2048;
    const temperature = options.temperature ?? 0.7;
    const hasImages = conversationHasImages(messages);
    let lastError = 'Unknown error';

    const systemText = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const turns = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    const contents = turns.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: toGeminiParts(m)
    }));

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const body = {
          contents,
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature
          }
        };
        if (systemText) {
          body.systemInstruction = { parts: [{ text: systemText }] };
        }
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.ok) {
          const data = await res.json();
          const parts = data.candidates?.[0]?.content?.parts || [];
          const text = parts.map((p) => p.text || '').join('');
          if (String(text).trim()) return String(text).trim();
          lastError = 'Empty response';
          continue;
        }
        const err = await res.json().catch(() => ({}));
        lastError = err.error?.message || err.message || `HTTP ${res.status}`;
      } catch (e) {
        lastError = e?.message || String(e);
      }
    }
    if (hasImages) {
      throw new Error(
        `${def.name} could not read your image(s). Try a smaller image, or pick a vision-capable model in Settings → AI Chat. (${lastError})`
      );
    }
    throw new Error(`${def.name} error: ${lastError}`);
  }

  async function chatCompletion(entry, messages, options = {}) {
    const sanitized = sanitizeEntry(entry);
    if (!sanitized) throw new Error('No valid API key configured.');
    const def = getProviderDef(sanitized.provider);
    if (!def) throw new Error(`Unknown provider: ${sanitized.provider}`);
    if (def.kind === 'gemini') {
      return geminiChat(def, sanitized, messages, options);
    }
    return openAiCompatibleChat(def, sanitized, messages, options);
  }

  global.AxisAiProviders = {
    PROVIDER_DEFS,
    AI_CONNECT_SRC:
      'https://api.groq.com https://api.openai.com https://generativelanguage.googleapis.com https://openrouter.ai https://api.mistral.ai',
    listProviderDefs,
    getProviderDef,
    createProviderId,
    sanitizeEntry,
    normalizeSettings,
    getActiveEntry,
    maskApiKey,
    displayName,
    providerSupportsImages,
    conversationHasImages,
    chatCompletion
  };
})(typeof window !== 'undefined' ? window : global);
