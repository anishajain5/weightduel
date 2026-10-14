import Anthropic from "@anthropic-ai/sdk";

export interface AiImage { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }
export interface AiRequest { model: string; system?: string; text: string; image?: AiImage; maxTokens: number }
export interface AiResult { text: string; inputTokens: number; outputTokens: number }

/** Thin seam over the Anthropic SDK so routes can be tested without network calls. */
export interface AiClient {
  complete(req: AiRequest): Promise<AiResult>;
  /** Yields text deltas; the returned promise-like `done` resolves with totals via the final yielded value. */
  stream(req: AiRequest): AsyncGenerator<string, AiResult, void>;
}

function toParams(r: AiRequest): Anthropic.MessageCreateParamsNonStreaming {
  const content: Anthropic.ContentBlockParam[] = [];
  if (r.image) content.push({ type: "image", source: { type: "base64", media_type: r.image.mediaType, data: r.image.base64 } });
  content.push({ type: "text", text: r.text });
  return { model: r.model, max_tokens: r.maxTokens, ...(r.system ? { system: r.system } : {}), messages: [{ role: "user", content }] };
}

export class AnthropicClient implements AiClient {
  private sdk: Anthropic;
  constructor(apiKey: string) {
    this.sdk = new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 });
  }
  async complete(r: AiRequest): Promise<AiResult> {
    const m = await this.sdk.messages.create(toParams(r));
    const text = m.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { text, inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens };
  }
  async *stream(r: AiRequest): AsyncGenerator<string, AiResult, void> {
    const s = this.sdk.messages.stream(toParams(r));
    for await (const ev of s) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
    }
    const m = await s.finalMessage();
    const text = m.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { text, inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens };
  }
}

/** Test double: returns canned text and records requests. */
export class FakeAi implements AiClient {
  requests: AiRequest[] = [];
  constructor(public reply: string | ((r: AiRequest) => string) = "{}") {}
  private text(r: AiRequest) {
    this.requests.push(r);
    return typeof this.reply === "function" ? this.reply(r) : this.reply;
  }
  async complete(r: AiRequest) {
    const text = this.text(r);
    return { text, inputTokens: 100, outputTokens: 50 };
  }
  async *stream(r: AiRequest): AsyncGenerator<string, AiResult, void> {
    const text = this.text(r);
    for (const w of text.match(/\S+\s*/g) ?? []) yield w;
    return { text, inputTokens: 100, outputTokens: 50 };
  }
}
