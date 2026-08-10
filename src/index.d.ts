/**
 * Type declarations for ga4-semantic-automator.
 */

export interface GA4SemanticOptions {
  /**
   * Extra parameters merged into the `config` hit
   * (e.g. `{ cookie_flags: 'SameSite=None;Secure' }`).
   */
  config?: Record<string, unknown>;
  /** Enable `debug_mode` and verbose console logs. */
  debug?: boolean;
  /** Send the initial `page_view` hit (default `true`). */
  sendPageView?: boolean;
  /** Custom data layer array name (default `"dataLayer"`). */
  dataLayerName?: string;
}

export interface UIInteractionPayload {
  /** The element's `id` attribute, or `null`. */
  element_id?: string | null;
  /** The element's `class` attribute, or `null`. */
  element_class?: string | null;
  /** Lowercased tag name, e.g. `"button"`. */
  element_tag: string;
  /** Visible text (or `data-ga-label` / `aria-label` override), or `null`. */
  element_text?: string | null;
  /** The element's `aria-label` attribute, or `null`. */
  element_aria_label?: string | null;
  /** The `data-ga-label` override, or `null`. */
  element_label?: string | null;
  /** Nearest structural container, e.g. `"section#pricing"` or `"nav"`. */
  structural_container?: string | null;
  /** Resolved destination URL for anchor clicks. */
  destination?: string | null;
  /** True when an anchor points to a different host than the current page. */
  is_outbound?: boolean;
}

export type GtagFunction = (...args: unknown[]) => void;

export interface GA4Controller {
  /** The gtag wrapper (bound to the configured data layer). */
  gtag: GtagFunction;
  /** Removes the delegated listener and resets internal state. */
  destroy(): void;
}

/**
 * Initializes GA4 for the given measurement ID and starts capturing semantic
 * interactions across the whole DOM. Returns `undefined` outside the browser.
 */
export function initGA4(
  measurementId: string,
  options?: GA4SemanticOptions,
): GA4Controller | undefined;

export default initGA4;
