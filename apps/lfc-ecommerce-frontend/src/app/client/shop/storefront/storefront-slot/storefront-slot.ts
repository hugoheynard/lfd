import { NgComponentOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { StorefrontContent } from '@lfd/contracts';
import type {
  ComposedCarousel,
  MediaFit,
  MediaSide,
  StorefrontShape,
  StorefrontTone,
} from '@lfd/storefront-layout';
import { FoldButtonComponent, FoldIconComponent } from 'fold-ng';

import { ClientCopyService, fill } from '../../../copy/client-copy.service';
import { STOREFRONT_RENDERERS } from '../storefront-renderers';

/** Ce qui suspend le défilement tant que ça dure. Le toucher, lui, l'arrête pour de bon. */
type Hold = 'hover' | 'focus';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * **Une case composée** : un contenu, ou plusieurs qui défilent à la même
 * place (`plan-vitrine-enregistrement.md`, D10 §3).
 *
 * Elle choisit le rendu dans le registre ({@link STOREFRONT_RENDERERS}) par le
 * TYPE du contenu, et lui passe les entrées communes. Les rendus ne savent
 * rien du défilement : c'est ici, et nulle part ailleurs, qu'il vit.
 *
 * Tous les contenus sont dans le DOM, superposés, un seul visible : la case
 * garde la hauteur du plus grand, et la page ne saute pas à chaque passage.
 *
 * 🔴 Le défilement automatique (`boutique-rayon-layout.md`, « Les réglages ») :
 * - le premier reste `firstSeconds`, les suivants `intervalSeconds` ;
 * - il se suspend au survol et au focus clavier, et reprend après ;
 * - il s'ARRÊTE au premier toucher : sur un téléphone, il n'y a pas de
 *   « sortie » du survol, et un contenu qui file sous le pouce se perd ;
 * - il ne démarre JAMAIS sous `prefers-reduced-motion`, ni côté serveur — il
 *   n'est armé qu'après le premier rendu dans le navigateur.
 */
@Component({
  selector: 'app-storefront-slot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet, FoldButtonComponent, FoldIconComponent],
  templateUrl: './storefront-slot.html',
  styleUrl: './storefront-slot.scss',
})
export class StorefrontSlot {
  /** Jamais vide : la composition n'envoie ici que des contenus affichables. */
  readonly contents = input.required<readonly StorefrontContent[]>();
  /** `null` : un seul contenu montré. */
  readonly carousel = input<ComposedCarousel | null>(null);
  readonly shape = input.required<StorefrontShape>();
  readonly mediaFit = input.required<MediaFit>();
  readonly mediaSide = input.required<MediaSide>();
  readonly tone = input.required<StorefrontTone>();

  private readonly renderers = inject(STOREFRONT_RENDERERS);
  protected readonly t = inject(ClientCopyService).t;

  /** Le contenu montré (0-indexé). */
  protected readonly index = signal(0);

  /** Chaque contenu, son rendu et ses entrées — calculés une fois, pas à chaque passage. */
  protected readonly slides = computed(() =>
    this.contents().map((content) => ({
      component: this.renderers[content.kind],
      inputs: {
        content,
        shape: this.shape(),
        mediaFit: this.mediaFit(),
        mediaSide: this.mediaSide(),
        tone: this.tone(),
      },
    })),
  );

  /** Le défilement ne vaut que s'il y a de quoi défiler. */
  protected readonly active = computed(() => (this.slides().length > 1 ? this.carousel() : null));

  protected readonly dots = computed(() => {
    const nav = this.active()?.nav;
    return nav === 'dots' || nav === 'both';
  });

  protected readonly arrows = computed(() => {
    const nav = this.active()?.nav;
    return nav === 'arrows' || nav === 'both';
  });

  /** Armé dans le navigateur seulement, et jamais sous `prefers-reduced-motion`. */
  private readonly armed = signal(false);
  private readonly holds = signal<ReadonlySet<Hold>>(new Set());
  private readonly stopped = signal(false);

  constructor() {
    afterNextRender(() => {
      // Un navigateur qui ne sait pas répondre à la question ne défile pas :
      // dans le doute, rien ne bouge.
      const motion =
        typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION) : null;
      this.armed.set(motion !== null && !motion.matches);
    });

    effect((onCleanup) => {
      const carousel = this.active();
      if (
        carousel === null ||
        !carousel.autoplay ||
        !this.armed() ||
        this.stopped() ||
        this.holds().size > 0
      ) {
        return;
      }
      const current = this.index();
      const seconds = current === 0 ? carousel.firstSeconds : carousel.intervalSeconds;
      const timer = setTimeout(() => {
        this.go(current + 1);
      }, seconds * 1000);
      onCleanup(() => {
        clearTimeout(timer);
      });
    });
  }

  protected dotLabel(position: number): string {
    return fill(this.t().shop.slideGoTo, {
      n: String(position + 1),
      count: String(this.slides().length),
    });
  }

  /** Montre le contenu `target`, en bouclant dans les deux sens. */
  protected go(target: number): void {
    const count = this.slides().length;
    this.index.set(((target % count) + count) % count);
  }

  protected hold(reason: Hold, on: boolean): void {
    this.holds.update((holds) => {
      const next = new Set(holds);
      if (on) {
        next.add(reason);
      } else {
        next.delete(reason);
      }
      return next;
    });
  }

  protected stop(): void {
    this.stopped.set(true);
  }
}
