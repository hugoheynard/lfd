import { afterNextRender, DestroyRef, ElementRef, inject, Injectable, signal } from '@angular/core';

/** Le calme qu'on attend après le dernier défilement avant de rendre la barre (Hugo, 2026-11-02). */
export const SCROLL_REST_MS = 1000;

/**
 * « Le rayon défile » — vrai pendant le défilement, faux {@link SCROLL_REST_MS}
 * après le dernier cran.
 *
 * Écoute la boîte qui défile réellement : dans le shell, c'est `.content-scroll`,
 * pas la fenêtre. L'écoute est passive, posée après le premier rendu (rien au
 * rendu serveur), retirée avec l'écran. Le signal ne change qu'aux deux
 * transitions : un défilement ne réveille pas l'écran à chaque cran.
 *
 * `hold()` retient le masquage — un focus dans la barre, une largeur de bureau.
 */
@Injectable()
export class ScrollRest {
  private readonly moving = signal(false);
  readonly scrolling = this.moving.asReadonly();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private hold: () => boolean = () => false;

  constructor() {
    const host = inject(ElementRef<HTMLElement>);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element: HTMLElement = host.nativeElement;
      const box: HTMLElement | Window = element.closest<HTMLElement>('.content-scroll') ?? window;
      const listener = () => this.moved();
      box.addEventListener('scroll', listener, { passive: true });
      destroyRef.onDestroy(() => {
        box.removeEventListener('scroll', listener);
        this.clear();
      });
    });
  }

  /** Ce qui retient la barre à l'écran malgré le défilement. */
  holdWhile(hold: () => boolean): void {
    this.hold = hold;
  }

  /** Un cran de défilement : masque (sauf retenue), et relance l'attente. */
  moved(): void {
    this.clear();
    if (this.hold()) {
      this.moving.set(false);
      return;
    }
    this.moving.set(true);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.moving.set(false);
    }, SCROLL_REST_MS);
  }

  private clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
