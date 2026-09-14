function unique(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    const value = String(raw || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  for (const value of Object.values(node)) walk(value, visit);
}

export function harvestUrls(payload) {
  const found = [];
  walk(payload, (node) => {
    if (typeof node.url === "string") found.push(node.url);
    if (typeof node.uri === "string") found.push(node.uri);
    if (typeof node.link === "string") found.push(node.link);
    if (node.web && typeof node.web.uri === "string") found.push(node.web.uri);
    if (node.web && typeof node.web.url === "string") found.push(node.web.url);
  });
  return unique(found).filter((u) => /^https?:\/\//i.test(u));
}

export function harvestAnthropic(message) {
  const urls = [];
  for (const block of message?.content || []) {
    if (block.type === "web_search_tool_result") {
      const content = Array.isArray(block.content) ? block.content : [];
      for (const item of content) {
        if (item?.url) urls.push(item.url);
      }
    }
    if (block.type === "text" && Array.isArray(block.citations)) {
      for (const citation of block.citations) {
        if (citation?.url) urls.push(citation.url);
      }
    }
    if (block.type === "server_tool_use" && block.name === "web_search") {
      continue;
    }
  }
  return unique([...urls, ...harvestUrls(message)]);
}

export function harvestGemini(response) {
  const urls = [];
  const candidates = response?.candidates || [];
  for (const candidate of candidates) {
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
    for (const chunk of chunks) {
      if (chunk?.web?.uri) urls.push(chunk.web.uri);
      if (chunk?.web?.url) urls.push(chunk.web.url);
    }
    const supports = candidate?.groundingMetadata?.groundingSupports || [];
    for (const support of supports) {
      const segs = support?.groundingChunkIndices || [];
      void segs;
    }
  }
  if (Array.isArray(response?.groundingChunks)) {
    for (const chunk of response.groundingChunks) {
      if (chunk?.web?.uri) urls.push(chunk.web.uri);
    }
  }
  return unique([...urls, ...harvestUrls(response)]);
}

export function collectAssistantText(message) {
  if (typeof message === "string") return message;
  if (typeof message?.text === "string") return message.text;
  const blocks = message?.content || message?.candidates?.[0]?.content?.parts || [];
  const parts = [];
  for (const block of blocks) {
    if (typeof block === "string") parts.push(block);
    else if (typeof block.text === "string") parts.push(block.text);
    else if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  return parts.join("\n");
}
