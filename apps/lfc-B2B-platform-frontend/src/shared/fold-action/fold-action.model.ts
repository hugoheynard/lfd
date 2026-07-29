import type { FoldIconName } from 'fold-ng';

/**
 * A user action rendered as a fold button — shared across the fold-* components
 * in this lib (banner CTAs, product-card buttons, …). When it carries a
 * `routerLink` or `href` it renders as a link (anchor); otherwise it is a plain
 * button and the click is surfaced through the host component's output.
 *
 * Data only — the *look* (emphasis/intent/size) is chosen by the host at the
 * point of use, not baked into the action.
 */
export interface FoldAction {
  /** Button label. */
  label: string;
  /** Optional leading icon (any registered fold icon). */
  icon?: FoldIconName;
  /** Internal route — rendered as a `routerLink` anchor. */
  routerLink?: string;
  /** External URL — rendered as an `href` anchor. */
  href?: string;
}
