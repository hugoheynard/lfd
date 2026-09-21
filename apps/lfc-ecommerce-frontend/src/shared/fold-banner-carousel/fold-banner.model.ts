import type { FoldAction } from '../fold-action/fold-action.model';

/**
 * One visual in the carousel: a background image (optional) with an overlaid
 * title, optional eyebrow/subtitle, a primary CTA and optional secondary
 * actions.
 */
export interface FoldBanner {
  /**
   * Stable handle used to **reference** this banner — notably to pin it as the
   * lead (always-first) slide via the carousel's `leadId`. Must be unique.
   */
  id: string;
  /** Background visual URL. Omit for a token-tinted panel (no image). */
  image?: string;
  /** Alt text for the visual. Leave empty for a purely decorative image. */
  imageAlt?: string;
  /** Small kicker shown above the title. */
  eyebrow?: string;
  /** The headline. Omit for a pure dressing banner (background only). */
  title?: string;
  /** Supporting line under the title. */
  subtitle?: string;
  /** Primary call to action (rendered solid). */
  cta?: FoldAction;
  /** Optional secondary actions (rendered outline). */
  secondaryActions?: readonly FoldAction[];
}

/** Which on-hover navigation controls the carousel shows. */
export type FoldBannerControls = 'dots' | 'arrows' | 'both' | 'none';

/** Emitted when a banner action is activated. */
export interface FoldBannerActionEvent {
  /** The banner the action belongs to. */
  banner: FoldBanner;
  /** The action that was activated. */
  action: FoldAction;
  /** `'cta'` for the primary action, `'secondary'` for the rest. */
  kind: 'cta' | 'secondary';
}
