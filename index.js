const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash";
const SEARCH_URL = "https://api.deepseek.com/v1/tools/search";
const OUTPUT_LANGUAGES = {
  en: "English",
  "zh-CN": "Simplified Chinese",
  ja: "Japanese",
  fr: "French",
  de: "German",
  es: "Spanish",
};

function configuration() {
  const language = host.setting("outputLanguage").trim();
  return {
    apiKey: host.setting("apiKey").trim(),
    baseURL: host.setting("baseURL").trim() || DEFAULT_BASE_URL,
    model: host.setting("model").trim() || DEFAULT_MODEL,
    outputLanguage: OUTPUT_LANGUAGES[language] || language || "English",
    research: host.setting("webResearch").trim().toLowerCase() !== "off",
  };
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function providerError(response, data) {
  const message = data?.error?.message || `The provider returned HTTP ${response.status}`;
  return response.status === 401 ? fail("setup", message) : new Error(message);
}

async function post(url, apiKey, body) {
  const headers = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`The provider returned invalid JSON (HTTP ${response.status})`);
  }
  if (!response.ok) throw providerError(response, data);
  return data;
}

function deepSeek(baseURL) {
  try {
    return new URL(baseURL).hostname === "api.deepseek.com";
  } catch {
    return false;
  }
}

function short(text, length) {
  return Array.from(text || "").slice(0, length).join("");
}

async function research(config, { track, lyric, question }) {
  if (!config.research || !deepSeek(config.baseURL)) return [];
  const artists = track.artists?.map((artist) => artist.name).join(" ") || "";
  // Search in English for source coverage, while preserving names and lyrics.
  const topic = lyric ? `lyrics meaning analysis ${lyric}` : question ? "background musical analysis" : "origins genre creators composition story";
  const query = short(`"${track.name}" "${artists}" ${topic}`, 128);
  const answer = await post(SEARCH_URL, config.apiKey, {
    query,
    ori_question: short(`Explain ${track.name} by ${artists}`, 128),
    count: 5,
    need_content: true,
  });
  return (answer.results || []).filter((result) => result.url).map((result) => ({
    title: result.title || result.site_name || result.url,
    url: result.url,
    publisher: result.site_name || "",
    snippet: result.snippet || "",
    summary: result.summary || "",
    content: short(result.content, 5000),
  }));
}

const SYSTEM_PROMPT = `You are a thoughtful music guide for curious listeners, not a critic writing for specialists. Your job is to help someone both understand a song and enjoy discovering it.
A good answer combines two things: clear explanation and memorable detail. Explain the song's style, character and sound in accessible language, including what its genre or musical tradition actually means here. Bring the explanation to life with well-chosen origins, people, production details, lyrics, anecdotes or later influence when they add understanding or make the song more memorable. Facts and storytelling should reinforce each other, not read like a biography followed by trivia.
Use the requested output language, preserving song titles, names and useful technical terms in their original form. Explain unfamiliar terms briefly when the reader needs them.

There is no fixed outline. Decide for yourself what is most interesting and how best to tell it: a sound, a story, a contrast, a question, a lyric or a chain of details. Choose the length and structure that suit the song. Do not force a hidden story, a grand thesis, listening exercises or recommendations into every answer.
Keep the reader oriented and curious. Avoid generic background, repeated metadata and reviewer-like displays of cleverness, but do not strip away the quirks and stories that make music interesting. Interpretation should help the listener notice something, not become confirmed artist intent.

Dates, events, credits and production details need support from supplied research. Prefer primary interviews and high-quality sources, preserve the scope of quotations and paraphrases, and acknowledge unresolved conflicts briefly. Never claim to have heard or analyzed the audio, and never invent timestamps, BPM, key, meter, chords, equipment, techniques, quotations, source URLs or media URLs. When research is supplied, cite only those pages.
For a lyric or follow-up, answer the question directly with the same blend of useful explanation and engaging detail.

Return only a JSON object with this shape:
{
  "title": "usually the song title",
  "subtitle": "useful artist, album or release context",
  "summary": "a clear, engaging introduction to the song's character",
  "genres": ["useful genres or musical traditions"],
  "sections": [{"title": "what this part helps the listener discover", "body": "informative, engaging plain-text prose", "items": ["natural listening prompts or specific recommendations"]}],
  "sources": [{"title": "source title", "url": "source URL", "publisher": "site or publication"}]
}
Use plain text, not Markdown, inside strings. Richness is welcome when it adds understanding or makes the song more memorable.`;

function normalizeExplanation(answer) {
  answer = answer && typeof answer === "object" ? answer : {};
  const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
  return {
    title: typeof answer.title === "string" ? answer.title : "",
    subtitle: typeof answer.subtitle === "string" ? answer.subtitle : "",
    summary: typeof answer.summary === "string" ? answer.summary : "",
    genres: strings(answer.genres),
    sections: Array.isArray(answer.sections) ? answer.sections.map((section) => ({
      title: typeof section.title === "string" ? section.title : "",
      body: typeof section.body === "string" ? section.body : "",
      items: strings(section.items),
    })) : [],
    sources: Array.isArray(answer.sources) ? answer.sources.filter((source) => source.url).map((source) => ({
      title: source.title || source.url,
      url: source.url,
      publisher: source.publisher || "",
    })) : [],
  };
}

function cleanContent(content) {
  return content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function parseExplanation(data) {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("The provider returned no explanation");
  return normalizeExplanation(JSON.parse(cleanContent(content)));
}

// Complete the open strings and containers of a JSON prefix. Prefixes ending in
// an incomplete escape or token simply wait for the next chunk.
function partialExplanation(content) {
  let source = cleanContent(content);
  if (!source) return null;
  const open = [];
  let inString = false;
  let escaped = false;
  for (const char of source) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") open.push(char);
    else if (char === "}" || char === "]") open.pop();
  }
  if (inString) {
    if (escaped) source = source.slice(0, -1);
    source += '"';
  }
  for (let i = open.length - 1; i >= 0; i--) source += open[i] === "{" ? "}" : "]";
  try {
    return normalizeExplanation(JSON.parse(source));
  } catch {
    return null;
  }
}

async function streamPost(url, apiKey, body, onContent) {
  const headers = { "content-type": "application/json", accept: "text/event-stream" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    throw providerError(response, data);
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await response.json();
    onContent(data.choices?.[0]?.message?.content || "");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const line = (text) => {
    if (!text.startsWith("data:")) return;
    const data = text.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data);
    if (event.error) throw new Error(event.error.message || "The stream failed");
    const content = event.choices?.[0]?.delta?.content;
    if (typeof content === "string") onContent(content);
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop();
    for (const text of lines) line(text.trimEnd());
    if (done) {
      if (buffer.trim()) line(buffer.trim());
      break;
    }
  }
}

function ready(config) {
  if (!config.apiKey && deepSeek(config.baseURL)) {
    throw fail("setup", "Add your DeepSeek API key in the Song Explainer settings");
  }
}

function completionBody(config, request, sources, stream) {
  const language = config.outputLanguage;
  return {
    model: config.model,
    stream,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ language, request, research_results: sources }) },
    ],
  };
}

function withSources(answer, sources) {
  if (sources.length) answer.sources = sources.map(({ title, url, publisher }) => ({ title, url, publisher }));
  return answer;
}

export async function explain(request) {
  const config = configuration();
  ready(config);
  const sources = await research(config, request);
  const data = await post(`${config.baseURL.replace(/\/+$/, "")}/chat/completions`, config.apiKey, completionBody(config, request, sources, false));
  return withSources(parseExplanation(data), sources);
}

export async function explainStream(request, publish) {
  const config = configuration();
  ready(config);
  const sources = await research(config, request);
  let content = "";
  let previous = "";
  let publishedAt = 0;
  await streamPost(
    `${config.baseURL.replace(/\/+$/, "")}/chat/completions`,
    config.apiKey,
    completionBody(config, request, sources, true),
    (delta) => {
      content += delta;
      const partial = partialExplanation(content);
      if (!partial || typeof publish !== "function") return;
      partial.sources = [];
      const fingerprint = JSON.stringify(partial);
      const now = Date.now();
      if (fingerprint !== previous && now - publishedAt >= 40) {
        previous = fingerprint;
        publishedAt = now;
        publish(partial);
      }
    },
  );
  if (!content.trim()) throw new Error("The provider returned no explanation");
  return withSources(normalizeExplanation(JSON.parse(cleanContent(content))), sources);
}
