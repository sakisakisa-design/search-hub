interface Env {
  GROK_API_KEY?: string;
  GROK_MODEL?: string;
  SONAR_API_KEY?: string;
  SONAR_MODEL?: string;
  BRAVE_API_KEY?: string;
  TAVILY_API_KEY?: string;
  ANYSEARCH_API_KEY?: string;
  ANYSEARCH_API_URL?: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  CF_AI_SEARCH_INSTANCE?: string;
  CF_AI_SEARCH_NAMESPACE?: string;
  AI_SEARCH_AUTO_FETCH?: string;
  SEARCH_HUB_TOKEN?: string;
  WORKERS_AI_SYNTH_MODEL?: string;
  WORKERS_AI_FAST_MODEL?: string;
  AI?: {
    run(model: string, input: unknown): Promise<unknown>;
  };
  AI_SEARCH_UPLOAD?: {
    items: {
      upload(name: string, content: string | ArrayBuffer | ReadableStream, options?: { metadata?: Record<string, string> }): Promise<unknown>;
    };
  };
  SEARCH_CACHE?: KVNamespace;
  SEARCH_DB?: D1Database;
  ASSETS?: Fetcher;
}
