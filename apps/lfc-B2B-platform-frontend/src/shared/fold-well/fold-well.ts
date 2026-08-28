import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FoldElementTitleComponent } from 'fold-ng';

/**
 * A **well** — a sunken region that holds a set apart from the page around it.
 *
 * It exists for one reason: a set that overflows needs to say so. Cards that
 * simply run off the edge of a page read as a layout accident; the same cards
 * inside a well read as a rail with more to the right. The well is the frame
 * that turns a clipped edge into a promise.
 *
 * ## `scrollable` is the whole point
 *
 * Without it the well is a plain block — useful for a set that fits. With it,
 * the content becomes a snapping horizontal rail that **bleeds past the well's
 * left padding and stops before its right one**, so the next item is always
 * half-visible. That asymmetry is deliberate: an item flush to the edge looks
 * like the last one.
 *
 * ## The head
 *
 * `title` renders a {@link FoldElementTitleComponent}; empty, there is no head
 * at all rather than an empty one. `titleVariant` picks its emphasis — a well
 * that opens a page wants `title`, one that labels a strip inside a card wants
 * `eyebrow`. `[wellLead]` takes whatever identifies the
 * set — an icon tile, or a `fold-avatar` with `square` when the well belongs to
 * a person. It is projected rather than configured because a well can be about
 * anything, and an `icon` input would have made it about icons.
 *
 * ## It owns its position
 *
 * The well tracks which item is in view and exposes {@link active} and
 * {@link goTo}. A companion indicator therefore needs no code in the page at
 * all — it binds to the well through a template reference. The alternative,
 * every host measuring the rail itself, is how two views of one scroller drift
 * apart.
 *
 * @example
 * ```html
 * <fold-well #rail scrollable title="My tracking" subtitle="3 in progress">
 *   <fold-avatar wellLead square name="LC" />
 *   <app-card class="item" />
 *   <app-card class="item" />
 *   <fold-scroll-indicator
 *     wellFoot
 *     [count]="3"
 *     [active]="rail.active()"
 *     (picked)="rail.goTo($event)"
 *   />
 * </fold-well>
 * ```
 */
@Component({
  selector: 'fold-well',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldElementTitleComponent],
  host: { '[attr.data-scrollable]': 'scrollable() ? "" : null' },
  templateUrl: './fold-well.html',
  styleUrl: './fold-well.scss',
})
export class FoldWellComponent {
  /** Empty renders NO head — an empty title bar is worse than none. */
  readonly title = input('');

  readonly subtitle = input('');

  /**
   * The head's emphasis, forwarded to {@link FoldElementTitleComponent}.
   *
   * `title` by default: a well is a REGION, and a region is announced, not
   * whispered. The eyebrow grain is for a strip labelled inside something else.
   */
  readonly titleVariant = input<'title' | 'eyebrow' | 'bar'>('title');

  /**
   * Turns the content into a horizontal, snapping rail.
   *
   * Off by default: a well that scrolls when it did not need to steals the
   * page's own scroll on a touch screen, and the item under the thumb stops
   * being the one that moves.
   */
  readonly scrollable = input(false, { transform: booleanAttribute });

  /**
   * The item nearest the rail's leading edge, zero-based.
   *
   * Derived from the SCROLL POSITION and not from a click: a rail is dragged
   * far more often than it is targeted, and a value that only followed clicks
   * would be wrong from the first gesture.
   */
  readonly active = signal(0);

  private readonly body = viewChild.required<ElementRef<HTMLDivElement>>('body');

  /** Brings an item into view. Out-of-range indices are ignored, not clamped —
   *  a silent clamp hides a caller that is counting something else. */
  goTo(index: number): void {
    const item = this.body().nativeElement.children[index];
    item?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }

  /** Recomputes {@link active} — bound to the rail's own scroll event. */
  protected onScroll(): void {
    const rail = this.body().nativeElement;
    const start = rail.getBoundingClientRect().left;
    let best = 0;
    let closest = Number.POSITIVE_INFINITY;
    Array.from(rail.children).forEach((child, index) => {
      const distance = Math.abs(child.getBoundingClientRect().left - start);
      if (distance < closest) {
        closest = distance;
        best = index;
      }
    });
    this.active.set(best);
  }
}
