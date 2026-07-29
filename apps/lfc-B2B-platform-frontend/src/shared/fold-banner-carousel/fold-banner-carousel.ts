import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { FoldActionButtonComponent } from '../fold-action';
import type { FoldAction } from '../fold-action/fold-action.model';
import type { FoldBanner, FoldBannerActionEvent, FoldBannerControls } from './fold-banner.model';

/** A normalised action row for the template — the action plus its role. */
interface RenderAction {
  key: string;
  action: FoldAction;
  kind: 'cta' | 'secondary';
  primary: boolean;
}

/**
 * `fold-banner-carousel` — a rotating hero of visual banners, each with a title,
 * an optional CTA and secondary actions. It auto-advances at a configurable
 * speed, pauses while hovered or focused (revealing the navigation controls —
 * pagination dots and/or side arrows), and resumes on leave. One banner can be
 * pinned as the always-first slide via {@link leadId}.
 *
 * Authored to fold conventions (signals, standalone, zoneless- and SSR-safe,
 * design tokens only) so it can move into `fold-ng` unchanged.
 */
@Component({
  selector: 'fold-banner-carousel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldActionButtonComponent],
  templateUrl: './fold-banner-carousel.html',
  styleUrl: './fold-banner-carousel.scss',
})
export class FoldBannerCarouselComponent {
  /** The banners to show. */
  readonly banners = input.required<readonly FoldBanner[]>();

  /**
   * The `id` of the banner that must always lead (index 0). When set, that
   * banner is moved to the front; unset keeps the array order.
   */
  readonly leadId = input<string | undefined>(undefined);

  /** Autoplay interval in milliseconds (the scroll speed). Floored at 1000ms. */
  readonly intervalMs = input(6000);

  /** Whether the carousel auto-advances. */
  readonly autoplay = input(true);

  /** Which on-hover navigation controls to show. */
  readonly controls = input<FoldBannerControls>('dots');

  /** Accessible label for the carousel region. */
  readonly ariaLabel = input('Bannières');

  /** Fired when a banner action (CTA or secondary) is activated. */
  readonly action = output<FoldBannerActionEvent>();

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Honour the OS "reduce motion" setting: no autoplay, no transitions. */
  private readonly reducedMotion = signal(false);

  /** Banners reordered so {@link leadId} leads. Identity changes on input change. */
  readonly ordered = computed<readonly FoldBanner[]>(() => {
    const list = this.banners();
    const lead = this.leadId();
    if (lead === undefined) {
      return list;
    }
    const idx = list.findIndex((b) => b.id === lead);
    const leadBanner = idx >= 0 ? list[idx] : undefined;
    if (idx <= 0 || leadBanner === undefined) {
      return list;
    }
    return [leadBanner, ...list.slice(0, idx), ...list.slice(idx + 1)];
  });

  readonly count = computed(() => this.ordered().length);

  /**
   * The index of the visible slide. A `linkedSignal` so it **resets to 0
   * (the lead) whenever the banners/order change**, while staying writable by
   * next/prev/goTo during a run.
   */
  readonly activeIndex = linkedSignal<readonly FoldBanner[], number>({
    source: () => this.ordered(),
    computation: () => 0,
  });

  /** Paused while hovered or focused (also true when reduced motion is on). */
  private readonly hovered = signal(false);
  readonly paused = computed(() => this.hovered() || this.reducedMotion());

  readonly showArrows = computed(
    () => this.count() > 1 && (this.controls() === 'arrows' || this.controls() === 'both'),
  );
  readonly showDots = computed(
    () => this.count() > 1 && (this.controls() === 'dots' || this.controls() === 'both'),
  );

  constructor() {
    if (this.isBrowser && typeof matchMedia === 'function') {
      this.reducedMotion.set(matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // Autoplay. Re-evaluated whenever a dependency changes: pausing (hover)
    // clears the timer, resuming re-arms it. Never runs on the server.
    effect((onCleanup) => {
      const playing = this.isBrowser && this.autoplay() && !this.paused() && this.count() > 1;
      if (!playing) {
        return;
      }
      const ms = Math.max(1000, this.intervalMs());
      const handle = setInterval(() => this.next(), ms);
      onCleanup(() => clearInterval(handle));
    });
  }

  /** Advance to the next slide (wraps). */
  next(): void {
    const n = this.count();
    if (n > 0) {
      this.activeIndex.update((i) => (i + 1) % n);
    }
  }

  /** Go to the previous slide (wraps). */
  prev(): void {
    const n = this.count();
    if (n > 0) {
      this.activeIndex.update((i) => (i - 1 + n) % n);
    }
  }

  /** Jump to a specific slide. */
  goTo(index: number): void {
    if (index >= 0 && index < this.count()) {
      this.activeIndex.set(index);
    }
  }

  /** Pause / resume on pointer or focus. */
  onEnter(): void {
    this.hovered.set(true);
  }
  onLeave(): void {
    this.hovered.set(false);
  }

  /** Normalised actions for a banner: the CTA first, then secondaries. */
  actionsFor(banner: FoldBanner): RenderAction[] {
    const rows: RenderAction[] = [];
    if (banner.cta) {
      rows.push({ key: `${banner.id}:cta`, action: banner.cta, kind: 'cta', primary: true });
    }
    (banner.secondaryActions ?? []).forEach((action, i) => {
      rows.push({ key: `${banner.id}:s${i}`, action, kind: 'secondary', primary: false });
    });
    return rows;
  }

  onAction(banner: FoldBanner, row: RenderAction): void {
    this.action.emit({ banner, action: row.action, kind: row.kind });
  }
}
