(function (global) {
  const DEFAULT_BASE_URL = "https://api.openai.com/v1";
  const DEFAULT_MODEL = "gpt-4.o-mini";

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  async function deriveKey(passphrase, salt) {
    const keyMaterial = await crypto.subtle.importKey("raw", textEncoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  function toBase64(bytes) {
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
  }

  function fromBase64(base64) {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }

  async function createKeyFile(openaiKey, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(openaiKey));
    return JSON.stringify({ v: 1, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)) });
  }

  async function readKeyFile(fileText, passphrase) {
    const parsed = JSON.parse(fileText);
    if (!parsed?.salt || !parsed?.iv || !parsed?.data) throw new Error("Invalid .eync file format");
    const salt = fromBase64(parsed.salt);
    const iv = fromBase64(parsed.iv);
    const data = fromBase64(parsed.data);
    const key = await deriveKey(passphrase, salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return textDecoder.decode(decrypted);
  }

  async function summarizeLiveSession(payload, opts = {}) {
    const apiKey = (opts.apiKey || "").trim();
    if (!apiKey) throw new Error("Missing OpenAI API key");

    const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/$/, "");
    const model = (opts.model || DEFAULT_MODEL).trim();

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "You summarize live stream session events into short bullet points." },
          { role: "user", content: JSON.stringify(payload) }
        ]
      })
    });

    if (!response.ok) {
      let detail = "";
      try {
        const err = await response.json();
        detail = err?.error?.message || JSON.stringify(err);
      } catch (_) {
        detail = await response.text();
      }
      throw new Error(`OpenAI error HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || "No summary generated.";
  }

  global.OmarAI = { summarizeLiveSession, DEFAULT_BASE_URL, DEFAULT_MODEL, createKeyFile, readKeyFile };
})(window);
