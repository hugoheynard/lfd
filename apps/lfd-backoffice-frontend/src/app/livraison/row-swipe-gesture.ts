import { swipeStep } from './row-swipe';

/**
 * **Le geste de glisser, mesuré du posé au levé du doigt** — l'état que les
 * fonctions pures de `row-swipe.ts` n'ont pas, sorti du composant
 * `LoadingRound`. Un levé sans posé (geste annulé) ne fait aucun pas.
 */
export class RowSwipeGesture {
  /** Où le doigt s'est posé sur la vue de rangée, le temps du geste. */
  private origin: { readonly x: number; readonly y: number } | null = null;

  start(event: PointerEvent): void {
    this.origin = { x: event.clientX, y: event.clientY };
  }

  /** Le pas du geste qui finit : +1 vers les portes, −1 vers le fond, 0 rien. */
  end(event: PointerEvent): -1 | 0 | 1 {
    const origin = this.origin;
    this.origin = null;
    if (origin === null) {
      return 0;
    }
    return swipeStep(event.clientX - origin.x, event.clientY - origin.y);
  }

  cancel(): void {
    this.origin = null;
  }
}
