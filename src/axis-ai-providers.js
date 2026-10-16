/**
 * Multi-provider AI API keys (Groq, OpenAI, Gemini, OpenRouter, Mistral).
 * Shared by the main browser renderer and Settings.
 * Prefers live /models discovery; hardcoded lists are fallbacks only.
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
      modelsUrl: 'https://api.groq.com/openai/v1/models',
      supportsImages: true,
      models: [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'meta-llama/llama-4-maverick-17b-128e-instruct',
        'qwen/qwen3-32b',
        'moonshotai/kimi-k2-instruct',
        'gemma2-9b-it'
      ],
      visionModels: [
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'meta-llama/llama-4-maverick-17b-128e-instruct'
      ]
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      signupUrl: 'https://platform.openai.com/api-keys',
      keyPlaceholder: 'sk-…',
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      modelsUrl: 'https://api.openai.com/v1/models',
      supportsImages: true,
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-3.5-turbo'],
      visionModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini']
    },
    gemini: {
      id: 'gemini',
      name: 'Google Gemini',
      signupUrl: 'https://aistudio.google.com/apikey',
      keyPlaceholder: 'AI…',
      kind: 'gemini',
      supportsImages: true,
      modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'],
      visionModels: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro']
    },
    openrouter: {
      id: 'openrouter',
      name: 'OpenRouter',
      signupUrl: 'https://openrouter.ai/keys',
      keyPlaceholder: 'sk-or-…',
      kind: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
      modelsUrl: 'https://openrouter.ai/api/v1/models',
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
      modelsUrl: 'https://api.mistral.ai/v1/models',
      supportsImages: true,
      models: ['mistral-small-latest', 'mistral-large-latest'],
      visionModels: ['pixtral-large-latest', 'pixtral-12b-2409']
    }
  };

  const modelsCache = new Map();
  const MODELS_TTL_MS = 3 * 60 * 1000;

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

  function unwrapApiKey(rawKey) {
    const k = String(rawKey || '').trim();
    if (!k || k.startsWith('axisenc:v1:')) return '';
    return k;
  }

  function sanitizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const provider = String(raw.provider || '').trim();
    const def = getProviderDef(provider);
    const apiKey = unwrapApiKey(raw.apiKey);
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

  function looksLikeVisionModel(id) {
    const s = String(id || '').toLowerCase();
    return /vision|llava|scout|maverick|pixtral|gpt-4o|gpt-4\.1|gemini|flash|omni/.test(s);
  }

  function uniqIds(list) {
    const out = [];
    const seen = new Set();
    for (const id of list || []) {
      const m = String(id || '').trim();
      if (!m || seen.has(m)) continue;
      seen.add(m);
      out.push(m);
    }
    return out;
  }

  function invalidateModelsCache(scope) {
    if (!scope) {
      modelsCache.clear();
      return;
    }
    const prefix = String(scope);
    for (const key of modelsCache.keys()) {
      if (key.startsWith(prefix)) modelsCache.delete(key);
    }
  }

  function isLikelyChatModel(id) {
    const s = String(id || '').toLowerCase();
    if (!s) return false;
    if (/embed|embedding|whisper|tts|dall-e|dalle|moderation|davinci|babbage|realtime|transcribe|image-preview|audio|sora/.test(s)) {
      return false;
    }
    return true;
  }

  function sortChatModelIds(ids) {
    const score = (id) => {
      const s = String(id).toLowerCase();
      let n = 0;
      if (/flash|instant|mini|small|8b|lite/.test(s)) n += 40;
      if (/gpt-4o|gpt-4\.1|llama-3\.3|llama-4|gemini-2|mistral-large|scout/.test(s)) n += 20;
      if (/free/.test(s)) n += 8;
      if (/70b|large|pro/.test(s)) n -= 6;
      return n;
    };
    return ids.slice().sort((a, b) => score(b) - score(a) || a.localeCompare(b));
  }

  async function fetchLiveModels(def, apiKey, options = {}) {
    if (!def?.modelsUrl || !apiKey) return null;
    const force = !!options.force;
    const cacheKey = `${def.id}:${apiKey.slice(0, 8)}:${apiKey.slice(-4)}`;
    const cached = modelsCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.at < MODELS_TTL_MS) {
      return cached.ids;
    }
    try {
      let url = def.modelsUrl;
      const headers = { ...(def.extraHeaders || {}) };
      if (def.kind === 'gemini') {
        url = `${def.modelsUrl}?key=${encodeURIComponent(apiKey)}`;
      } else {
        headers.Authorization = `Bearer ${apiKey}`;
      }
      const res = await fetch(url, { method: 'GET', headers });
      if (!res.ok) return null;
      const data = await res.json();
      let ids = [];
      if (def.kind === 'gemini') {
        const models = Array.isArray(data.models) ? data.models : [];
        ids = models
          .filter((m) => {
            const methods = m.supportedGenerationMethods || [];
            return !methods.length || methods.includes('generateContent');
          })
          .map((m) => String(m.name || '').replace(/^models\//, ''))
          .filter(Boolean);
      } else {
        ids = (Array.isArray(data.data) ? data.data : [])
          .map((m) => String(m.id || '').trim())
          .filter(Boolean);
      }
      ids = sortChatModelIds(uniqIds(ids).filter(isLikelyChatModel));
      if (!ids.length) return null;
      modelsCache.set(cacheKey, { at: Date.now(), ids });
      return ids;
    } catch (_) {
      return null;
    }
  }

  function parseModelSelection(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === 'auto') return { mode: 'auto', entryId: null, modelId: null };
    const sep = raw.indexOf(':');
    if (sep <= 0) return { mode: 'auto', entryId: null, modelId: null };
    const entryId = raw.slice(0, sep);
    const modelId = raw.slice(sep + 1).trim();
    if (!entryId || !modelId) return { mode: 'auto', entryId: null, modelId: null };
    return { mode: 'fixed', entryId, modelId };
  }

  function getEntryById(settings, entryId) {
    const { aiProviders } = normalizeSettings(settings);
    const id = String(entryId || '').trim();
    return aiProviders.find((p) => p.id === id) || null;
  }

  async function buildChatModelCatalog(settings, options = {}) {
    const force = !!options.force;
    const { aiProviders } = normalizeSettings(settings);
    const items = [
      {
        value: 'auto',
        label: 'Auto',
        hint: 'Uses the fastest available model',
        providerLabel: ''
      }
    ];
    if (!aiProviders.length) return items;

    const groups = await Promise.all(
      aiProviders.map(async (entry) => {
        const def = getProviderDef(entry.provider);
        if (!def) return null;
        const liveIds = await fetchLiveModels(def, entry.apiKey, { force });
        const fallback = sortChatModelIds(
          uniqIds([...(def.models || []), ...(def.visionModels || [])]).filter(isLikelyChatModel)
        );
        const ids = liveIds?.length
          ? sortChatModelIds(uniqIds([...liveIds, ...fallback]).filter(isLikelyChatModel))
          : fallback;
        const providerLabel = displayName(entry);
        const models = ids.slice(0, 120).map((modelId) => ({
          value: `${entry.id}:${modelId}`,
          label: modelId,
          providerLabel,
          entryId: entry.id,
          modelId
        }));
        return { providerLabel, models };
      })
    );

    for (const group of groups) {
      if (!group?.models?.length) continue;
      items.push(...group.models);
    }
    return items;
  }

  function resolveModelsForChat(def, entry, messages, liveIds, explicitModelId) {
    const modelId = String(explicitModelId || '').trim();
    if (modelId && modelId !== 'auto') {
      return [modelId];
    }
    return pickModelsForRequest(def, entry, messages, liveIds);
  }

  function pickModelsForRequest(def, entry, messages, liveIds) {
    const hasImages = conversationHasImages(messages);
    const fallbackText = Array.isArray(def.models) ? def.models.slice() : [];
    const fallbackVision = Array.isArray(def.visionModels) ? def.visionModels.slice() : [];
    const live = Array.isArray(liveIds) ? liveIds.slice() : [];
    const custom = String(entry?.model || '').trim();

    if (hasImages) {
      const liveVision = live.filter(looksLikeVisionModel);
      return uniqIds([
        ...(custom && looksLikeVisionModel(custom) ? [custom] : []),
        ...fallbackVision.filter((m) => !live.length || live.includes(m)),
        ...liveVision,
        ...fallbackVision,
        ...(custom ? [custom] : []),
        ...live
      ]);
    }

    // Prefer a user-picked model only if it still exists; otherwise use whatever is available.
    const customOk = custom && (!live.length || live.includes(custom));
    return uniqIds([
      ...(customOk ? [custom] : []),
      ...fallbackText.filter((m) => !live.length || live.includes(m)),
      ...live,
      ...fallbackText,
      ...(custom && !customOk ? [custom] : [])
    ]);
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

  function isModelUnavailableError(msg) {
    const s = String(msg || '').toLowerCase();
    return /model|decommissioned|does not exist|not found|unknown model|invalid_model|no longer supported|deprecated|404/.test(
      s
    );
  }

  async function readSseStream(response, onPayload) {
    const reader = response.body?.getReader?.();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() || '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          onPayload(JSON.parse(data));
        } catch (_) {}
      }
    }
  }

  function extractOpenAiDelta(payload) {
    const choice = payload?.choices?.[0];
    const delta = choice?.delta?.content ?? choice?.message?.content;
    return typeof delta === 'string' ? delta : '';
  }

  function extractGeminiDelta(payload) {
    const parts = payload?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map((p) => p.text || '').join('');
  }

  async function openAiCompatibleChatStream(def, entry, messages, options, onDelta) {
    const apiKey = String(entry.apiKey || '').trim();
    const liveIds = await fetchLiveModels(def, apiKey, { force: !!options.forceModels });
    const models = resolveModelsForChat(def, entry, messages, liveIds, options.model);
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
            temperature,
            stream: true
          }),
          signal: options.signal
        });
        if (res.ok && res.body) {
          let full = '';
          await readSseStream(res, (payload) => {
            const piece = extractOpenAiDelta(payload);
            if (!piece) return;
            full += piece;
            onDelta(full, piece);
          });
          if (String(full).trim()) return String(full).trim();
          lastError = 'Empty response';
          continue;
        }
        const err = await res.json().catch(() => ({}));
        lastError = err.error?.message || err.message || `HTTP ${res.status}`;
        if (res.status === 401 || res.status === 403 || res.status === 429) break;
      } catch (e) {
        lastError = e?.message || String(e);
      }
    }
    if (hasImages) {
      throw new Error(
        `${def.name} could not read your image(s). Try a smaller image, or pick a vision-capable model. (${lastError})`
      );
    }
    throw new Error(`${def.name} error: ${lastError}`);
  }

  async function geminiChatStream(def, entry, messages, options, onDelta) {
    const apiKey = String(entry.apiKey || '').trim();
    const liveIds = await fetchLiveModels(def, apiKey, { force: !!options.forceModels });
    const models = resolveModelsForChat(def, entry, messages, liveIds, options.model);
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
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
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
        if (res.ok && res.body) {
          let full = '';
          let lastLen = 0;
          await readSseStream(res, (payload) => {
            const piece = extractGeminiDelta(payload);
            if (!piece) return;
            if (piece.length >= lastLen) {
              full = piece;
            } else {
              full += piece;
            }
            lastLen = piece.length;
            onDelta(full, piece);
          });
          if (String(full).trim()) return String(full).trim();
          lastError = 'Empty response';
          continue;
        }
        const err = await res.json().catch(() => ({}));
        lastError = err.error?.message || err.message || `HTTP ${res.status}`;
        if (res.status === 401 || res.status === 403 || res.status === 429) break;
      } catch (e) {
        lastError = e?.message || String(e);
      }
    }
    if (hasImages) {
      throw new Error(
        `${def.name} could not read your image(s). Try a smaller image, or pick a vision-capable model. (${lastError})`
      );
    }
    throw new Error(`${def.name} error: ${lastError}`);
  }

  async function chatCompletionStream(entry, messages, options = {}, onDelta) {
    const sanitized = sanitizeEntry(entry);
    if (!sanitized) throw new Error('No valid API key configured.');
    const def = getProviderDef(sanitized.provider);
    if (!def) throw new Error(`Unknown provider: ${sanitized.provider}`);
    if (typeof onDelta !== 'function') {
      return chatCompletion(sanitized, messages, options);
    }
    try {
      if (def.kind === 'gemini') {
        return await geminiChatStream(def, sanitized, messages, options, onDelta);
      }
      return await openAiCompatibleChatStream(def, sanitized, messages, options, onDelta);
    } catch (streamErr) {
      const fallback = await chatCompletion(sanitized, messages, options);
      onDelta(fallback, fallback);
      return fallback;
    }
  }

  async function openAiCompatibleChat(def, entry, messages, options) {
    const apiKey = String(entry.apiKey || '').trim();
    const liveIds = await fetchLiveModels(def, apiKey, { force: !!options.forceModels });
    const models = resolveModelsForChat(def, entry, messages, liveIds, options.model);
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
        if (res.status === 401 || res.status === 403 || res.status === 429) break;
        if (!isModelUnavailableError(lastError) && res.status !== 404 && res.status !== 400) {
          // Non-model errors: still try next id in case another works
        }
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
    const liveIds = await fetchLiveModels(def, apiKey, { force: !!options.forceModels });
    const models = resolveModelsForChat(def, entry, messages, liveIds, options.model);
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
        if (res.status === 401 || res.status === 403 || res.status === 429) break;
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
    getEntryById,
    maskApiKey,
    displayName,
    providerSupportsImages,
    conversationHasImages,
    parseModelSelection,
    buildChatModelCatalog,
    invalidateModelsCache,
    chatCompletion,
    chatCompletionStream,
    fetchLiveModels
  };
})(typeof window !== 'undefined' ? window : global);
