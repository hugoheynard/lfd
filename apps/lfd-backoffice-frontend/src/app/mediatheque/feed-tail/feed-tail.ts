import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { FoldButtonComponent, FoldSpinnerComponent } from 'fold-ng';

/**
 * Ce que le bas de la grille a à dire :
 * - `more` — il reste à lire ;
 * - `loading` — une page est en vol ;
 * - `end` — tout est lu, après plus d'une page ;
 * - `idle` — rien à dire (une seule page, ou un échec que l'écran dit ailleurs).
 */
export type FeedTailState = 'more' | 'loading' | 'end' | 'idle';

/** Commence à lire un peu avant d'atteindre le bas : la suite arrive sans attente. */
const AHEAD = '0px 0px 600px 0px';

/**
 * **Le bas du fil** — la sentinelle du défilement continu, et son repli.
 *
 * Elle s'observe elle-même : quand elle approche de l'écran, elle demande la
 * suite. 🔴 L'observation est REPOSÉE à chaque retour à `more` : un
 * observateur ne parle que lorsqu'une intersection CHANGE, et une page courte
 * (le filtre « Inutilisées » en rend, plan L2 point 3) laisse la sentinelle
 * dans l'écran sans jamais la faire entrer — le fil s'arrêterait là. Une
 * observation neuve rend l'état courant d'emblée.
 *
 * Le bouton « Charger la suite » reste toujours là : on ne défile pas au
 * clavier jusqu'à une sentinelle, et un navigateur sans `IntersectionObserver`
 * doit pouvoir lire tout le fonds.
 */
@Component({
  selector: 'app-feed-tail',
  imports: [FoldButtonComponent, FoldSpinnerComponent],
  templateUrl: './feed-tail.html',
  styleUrl: './feed-tail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedTail {
  readonly state = input.required<FeedTailState>();
  readonly reached = output();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer: IntersectionObserver | null = null;

  constructor() {
    effect(() => {
      this.disconnect();
      if (this.state() === 'more') {
        this.observe();
      }
    });
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  private observe(): void {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.disconnect();
          this.reached.emit();
        }
      },
      { rootMargin: AHEAD },
    );
    this.observer.observe(this.host.nativeElement);
  }

  private disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
