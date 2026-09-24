import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FoldButtonIconComponent, FoldIconComponent } from 'fold-ng';

import {
  type CarouselSettings,
  type MediaFit,
  type MediaSide,
  slideAt,
  type StorefrontTone,
} from '@lfd/storefront-layout';

/** Pas du minuteur de simulation : assez fin pour qu'un changement tombe à la seconde. */
const TICK_MS = 250;

/**
 * La maquette d'un objet de vitrine : une zone « image » placée selon son
 * côté, et une zone « texte » en lignes grises. Elle montre la composition,
 * pas un contenu (il n'y en a pas encore).
 *
 * En `cover`, l'image remplit sa zone ; en `contain`, un rectangle plus petit
 * centré sur le fond de l'objet dit « l'image entière, sans rognage ». Le
 * ton donne ses couleurs à toute la maquette ; hachures et lignes suivent la
 * couleur du texte, lisibles sur les trois fonds.
 *
 * Avec plusieurs contenus, elle SIMULE le défilement : un grand numéro au
 * centre de l'image, les points et/ou les flèches selon la navigation. En
 * automatique, UN minuteur par maquette, arrêté à la destruction, en pause au
 * survol, et jamais lancé sous `prefers-reduced-motion`. Sans automatique, les
 * flèches et les points font passer d'un contenu à l'autre.
 */
@Component({
  selector: 'app-storefront-media-mock',
  imports: [FoldButtonIconComponent, FoldIconComponent],
  templateUrl: './storefront-media-mock.html',
  styleUrl: './storefront-media-mock.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.side-left]': "side() === 'left'",
    '[class.side-right]': "side() === 'right'",
    '[class.side-top]': "side() === 'top'",
    '[class.side-full]': "side() === 'full'",
    '[class.tone-light]': "tone() === 'light'",
    '[class.tone-dark]': "tone() === 'dark'",
    '[class.tone-accent]': "tone() === 'accent'",
    '(pointerenter)': 'hovered.set(true)',
    '(pointerleave)': 'hovered.set(false)',
  },
})
export class StorefrontMediaMock {
  readonly side = input.required<MediaSide>();
  readonly fit = input.required<MediaFit>();
  /** Les couleurs de l'objet : papier crème, encre noire ou encre bleue. */
  readonly tone = input<StorefrontTone>('light');
  /** `null` pour un seul contenu. */
  readonly carousel = input<CarouselSettings | null>(null);

  protected readonly hovered = signal(false);
  private readonly elapsedMs = signal(0);
  private readonly manualIndex = signal(0);
  protected readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  protected readonly autoplaying = computed(
    () => this.carousel()?.autoplay === true && !this.reducedMotion,
  );

  protected readonly slides = computed(() =>
    Array.from({ length: this.carousel()?.sampleCount ?? 0 }, (_, index) => index),
  );

  protected readonly index = computed(() => {
    const carousel = this.carousel();
    if (carousel === null) {
      return 0;
    }
    if (carousel.autoplay) {
      return this.reducedMotion ? 0 : slideAt(this.elapsedMs(), carousel);
    }
    return this.manualIndex() % carousel.sampleCount;
  });

  protected readonly showDots = computed(() => {
    const nav = this.carousel()?.nav;
    return nav === 'dots' || nav === 'both';
  });

  protected readonly showArrows = computed(() => {
    const nav = this.carousel()?.nav;
    return nav === 'arrows' || nav === 'both';
  });

  constructor() {
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = (): void => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    inject(DestroyRef).onDestroy(stop);

    // Un réglage qui change relance la séquence au premier contenu.
    effect(() => {
      this.carousel();
      this.elapsedMs.set(0);
      this.manualIndex.set(0);
    });

    effect(() => {
      stop();
      if (this.autoplaying()) {
        timer = setInterval(() => {
          if (!this.hovered()) {
            this.elapsedMs.update((elapsed) => elapsed + TICK_MS);
          }
        }, TICK_MS);
      }
    });
  }

  protected step(delta: number): void {
    const count = this.carousel()?.sampleCount ?? 1;
    this.manualIndex.update((index) => (((index + delta) % count) + count) % count);
  }

  protected show(index: number): void {
    this.manualIndex.set(index);
  }
}
