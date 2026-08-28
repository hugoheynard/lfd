import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

/**
 * How the markers are drawn.
 *
 * - `morse` — round dots, and the active one stretches into a dash. The shape
 *   itself carries the state, so the indicator survives a colour it cannot
 *   control: on a dark well a hue shift is easy to miss, a length is not.
 * - `dots` — every marker stays a dot; only the fill changes. The quiet one,
 *   for a light surface where colour reads on its own.
 * - `lines` — every marker is a dash, like a progress track cut into segments.
 *   Right when the items are *steps* rather than siblings.
 */
export type FoldScrollIndicatorVariant = 'morse' | 'dots' | 'lines';

/**
 * The position of a horizontal scroller, and a way back to any of its items.
 *
 * **It is not a page count.** It answers "where am I in something I cannot see
 * whole" — which is why it belongs next to a scroller and nowhere else.
 *
 * ## It follows position, never clicks
 *
 * `active` is an input, so the owner feeds it from the scroll position. An
 * indicator that only tracked its own clicks would lie the moment a finger
 * dragged the rail — and dragging is how people actually move a rail.
 *
 * ## Targets are bigger than marks
 *
 * A six-pixel dot is not a tap target. Each marker sits in a box tall and wide
 * enough for a thumb; the mark is the part you see, the box is the part you
 * hit.
 */
@Component({
  selector: 'fold-scroll-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.data-interactive]': 'interactive() ? "" : null',
  },
  templateUrl: './fold-scroll-indicator.html',
  styleUrl: './fold-scroll-indicator.scss',
})
export class FoldScrollIndicatorComponent {
  /** How many items the scroller holds. Below two, the indicator draws nothing. */
  readonly count = input.required<number>();

  /** The item in view, zero-based. */
  readonly active = input<number>(0);

  readonly variant = input<FoldScrollIndicatorVariant>('morse');

  /**
   * Whether a marker can be picked.
   *
   * A read-only indicator renders plain elements rather than disabled buttons:
   * a button that cannot be pressed is still announced as a button, and a
   * screen reader then offers a control that does nothing.
   */
  readonly interactive = input(true, { transform: booleanAttribute });

  /** Accessible label for a marker. `{n}` becomes the item's rank, from one. */
  readonly markerLabel = input('Go to item {n}');

  readonly picked = output<number>();

  /** Rendered only when there is more than one item — one item is not a set. */
  readonly markers = computed(() => {
    const total = this.count();
    return total > 1 ? Array.from({ length: total }, (_, index) => index) : [];
  });

  protected label(index: number): string {
    return this.markerLabel().replace('{n}', String(index + 1));
  }

  protected pick(index: number): void {
    if (this.interactive()) {
      this.picked.emit(index);
    }
  }
}
