// ═══════════════════════════════════════════════════════════════════
// Phase 5.5 — Provider Router
//
// Orchestrates AI provider requests with automatic failover.
// Primary provider: Gemini (default)
// Fallback provider: Groq (default)
//
// Automatically fails over only on recoverable provider errors (429,
// 5xx, timeouts, network issues). Does not call fallback on auth
// errors or when primary succeeds.
// ═══════════════════════════════════════════════════════════════════

import { GeminiProvider } from "./gemini-provider.js";
import { GroqProvider } from "./groq-provider.js";
import { AI_PRIMARY_PROVIDER, AI_FALLBACK_PROVIDER, AI_FORCE_PRIMARY_FAILURE } from "../config.js";


/**
 * Classifies an error to determine whether automatic failover is appropriate.
 *
 * @param {Error|object} error
 * @returns {{ recoverable: boolean, reason: string }}
 */
export function classifyError(error) {
  if (!error) return { recoverable: false, reason: "unknown" };

  const status =
    error.status ||
    error.statusCode ||
    (error.response && error.response.status);
  const code = error.code;
  const msg = (error.message || "").toLowerCase();

  // 1. Permanent / Non-recoverable errors (Never failover on invalid credentials)
  if (
    status === 401 ||
    status === 403 ||
    msg.includes("api key") ||
    msg.includes("api_key") ||
    msg.includes("unauthorized") ||
    msg.includes("permission_denied") ||
    msg.includes("forbidden")
  ) {
    return { recoverable: false, reason: "auth_error" };
  }

  if (status === 404 || msg.includes("not found")) {
    return { recoverable: false, reason: "not_found" };
  }

  if (status === 400 && !msg.includes("quota") && !msg.includes("rate")) {
    return { recoverable: false, reason: "bad_request" };
  }

  // 2. Recoverable errors (Failover to secondary provider)
  if (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted")
  ) {
    return { recoverable: true, reason: "rate_limit" };
  }

  if (
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    msg.includes("timeout") ||
    msg.includes("timed out")
  ) {
    return { recoverable: true, reason: "timeout" };
  }

  if (status >= 500 && status <= 599) {
    return { recoverable: true, reason: "server_error" };
  }

  if (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded")
  ) {
    return { recoverable: true, reason: "network_error" };
  }

  return { recoverable: false, reason: "unknown_error" };
}

import { sanitizeErrorMessage } from "../security.js";
export { sanitizeErrorMessage };

/**
 * Structured observability logger.
 */
export function logProviderEvent({ provider, status, reason, fallback }) {
  const parts = [`provider=${provider}`, `status=${status}`];
  if (reason) parts.push(`reason=${reason}`);
  if (fallback) parts.push(`fallback=true`);
  console.log(`[ProviderRouter] ${parts.join(" ")}`);
}

export class ProviderRouter {
  /**
   * @param {object} [options]
   * @param {string} [options.primary] - Name of primary provider (defaults to AI_PRIMARY_PROVIDER or "gemini")
   * @param {string} [options.fallback] - Name of fallback provider (defaults to AI_FALLBACK_PROVIDER or "groq")
   * @param {Object.<string, object>} [options.providers] - Map of registered provider instances
   */
  constructor(options = {}) {
    this.primaryProviderName = options.primary || AI_PRIMARY_PROVIDER || "gemini";
    this.fallbackProviderName = options.fallback || AI_FALLBACK_PROVIDER || "groq";
    this.providers = options.providers || {};
    this.forcePrimaryFailure =
      options.forcePrimaryFailure !== undefined
        ? options.forcePrimaryFailure
        : AI_FORCE_PRIMARY_FAILURE;
  }

  /**
   * Registers a provider instance by name.
   */
  registerProvider(name, provider) {
    this.providers[name] = provider;
    return this;
  }

  /**
   * Retrieves a provider by name.
   */
  getProvider(name) {
    return this.providers[name];
  }

  /**
   * Sends message with automatic failover from primary to fallback provider.
   *
   * @param {object} params
   * @returns {Promise<{ text: string, provider: string, fallback: boolean, fallbackReason?: string, toolCalls: string[], raw: object }>}
   */
  async sendMessage(params) {
    const primary = this.getProvider(this.primaryProviderName);
    const fallback = this.getProvider(this.fallbackProviderName);

    if (!primary) {
      throw new Error(`Primary provider "${this.primaryProviderName}" is not registered.`);
    }

    // 1. Attempt primary provider (or simulate recoverable failure in dev mode)
    try {
      const shouldForceFail =
        this.forcePrimaryFailure || process.env.AI_FORCE_PRIMARY_FAILURE === "true";

      if (shouldForceFail) {
        console.log(
          `  🧪 [DEV MODE] Simulating recoverable 503 error for "${this.primaryProviderName}" (AI_FORCE_PRIMARY_FAILURE=true)`
        );
        const simulatedError = new Error(
          `Simulated recoverable provider failure for ${this.primaryProviderName} (AI_FORCE_PRIMARY_FAILURE=true)`
        );
        simulatedError.status = 503;
        throw simulatedError;
      }

      const result = await primary.sendMessage(params);
      logProviderEvent({ provider: this.primaryProviderName, status: "success" });
      return {
        ...result,
        provider: this.primaryProviderName,
        fallback: false,
      };
    } catch (primaryError) {

      const classification = classifyError(primaryError);
      logProviderEvent({
        provider: this.primaryProviderName,
        status: "failed",
        reason: classification.reason,
      });

      // Do NOT attempt fallback if error is non-recoverable (e.g. auth error) or if no fallback configured
      const hasValidFallback =
        fallback &&
        this.fallbackProviderName !== "none" &&
        this.fallbackProviderName !== this.primaryProviderName;

      if (!classification.recoverable || !hasValidFallback) {
        throw primaryError;
      }

      // 2. Attempt fallback provider on recoverable error
      logProviderEvent({
        provider: this.fallbackProviderName,
        status: "attempting",
        fallback: true,
        reason: classification.reason,
      });

      try {
        const fallbackResult = await fallback.sendMessage(params);
        logProviderEvent({
          provider: this.fallbackProviderName,
          status: "success",
          fallback: true,
        });
        return {
          ...fallbackResult,
          provider: this.fallbackProviderName,
          fallback: true,
          fallbackReason: classification.reason,
        };
      } catch (fallbackError) {
        const fallbackClassification = classifyError(fallbackError);
        logProviderEvent({
          provider: this.fallbackProviderName,
          status: "failed",
          fallback: true,
          reason: fallbackClassification.reason,
        });

        const safePrimaryMsg = sanitizeErrorMessage(primaryError.message);
        const safeFallbackMsg = sanitizeErrorMessage(fallbackError.message);

        throw new Error(
          `Primary provider (${this.primaryProviderName}) failed [${classification.reason}]: ${safePrimaryMsg}. ` +
          `Fallback provider (${this.fallbackProviderName}) also failed [${fallbackClassification.reason}]: ${safeFallbackMsg}.`
        );
      }
    }
  }
}

/**
 * Factory function creating a ProviderRouter with default Gemini and Groq providers.
 */
export function createDefaultRouter(options = {}) {
  const router = new ProviderRouter(options);

  if (!router.getProvider("gemini")) {
    router.registerProvider("gemini", new GeminiProvider(options.geminiOptions));
  }

  if (!router.getProvider("groq")) {
    router.registerProvider("groq", new GroqProvider(options.groqOptions));
  }

  return router;
}
