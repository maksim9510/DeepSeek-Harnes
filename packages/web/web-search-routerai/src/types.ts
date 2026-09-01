/**
 * Provider-private wire types for the OpenAI-compatible `chat/completions`
 * search request and its `url_citation` annotations, plus the Anthropic
 * Messages response shape. This provider talks directly to the chat model's
 * own endpoint, so these types intentionally do not create a dependency on
 * `ctx.llm`.
 * @module @deepseek-ai/dsh-web-search-routerai/types
 */

/** A `url_citation` annotation attached to a chat completion message. */
export interface UrlCitation {
  url: string
  title?: string | null
  content?: string | null
  start_index?: number | null
  end_index?: number | null
}

/** One annotation object in `message.annotations[]`. */
export interface CitationAnnotation {
  type: 'url_citation'
  url_citation: UrlCitation
}

/** The assistant message inside a chat completion choice. */
export interface ChatCompletionMessage {
  role: string
  content?: string | null
  annotations?: CitationAnnotation[]
}

/** One choice of a chat completion response. */
export interface ChatCompletionChoice {
  index: number
  finish_reason?: string | null
  message: ChatCompletionMessage
}

/** The OpenAI-compatible `chat/completions` response envelope. */
export interface ChatCompletionResponse {
  id?: string
  model?: string
  choices?: ChatCompletionChoice[]
  error?: { message?: string } | string
}

/** A `web_search_result` item inside a `web_search_tool_result` block. */
export interface WebSearchResultItem {
  type: string
  url: string
  title?: string | null
  page_age?: string | null
}

/** A `web_search_tool_result` content block: the citeable result shape. */
export interface WebSearchToolResultBlock {
  type: 'web_search_tool_result'
  content?: WebSearchResultItem[]
}

/** One citation location inside a `text` block (the snippet source). */
export interface CitationLocation {
  type?: string
  url?: string | null
  cited_text?: string | null
}

/** A `text` content block: the model's prose plus per-URL citations. */
export interface TextBlock {
  type: 'text'
  text?: string | null
  citations?: CitationLocation[]
}

/** Any content block; only `web_search_tool_result` and `text` are consumed. */
export type ContentBlock = WebSearchToolResultBlock | TextBlock | { type: string }

/** Anthropic Messages response envelope. */
export interface AnthropicResponse {
  content?: ContentBlock[]
}
