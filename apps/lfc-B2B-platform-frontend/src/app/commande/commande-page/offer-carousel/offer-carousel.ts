import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';

/**
 * Le carrousel de sections : « Nouvelle commande », puis « En ce moment ».
 *
 * Un seul emplacement, une pile ordonnée — et rien de perdu quand il n'y a pas
 * d'événement : la pile démarre alors sur la commande.
 *
 * Le défilement est NATIF, avec accrochage (`scroll-snap`), là où la réf anime
 * un `translateX`. C'est délibéré : un doigt sur un téléphone attend l'inertie,
 * le rebond et la reprise en cours de geste du navigateur, qu'aucune
 * transformation pilotée ne rend. Les points ne font que refléter la position et
 * la commander — ils ne la possèdent pas, donc rien ne peut désynchroniser.
 */
@Component({
  selector: 'app-offer-carousel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './offer-carousel.html',
  styleUrl: './offer-carousel.scss',
})
export class OfferCarousel {
  /** Le nom de chaque panneau, pour l'annoncer aux technologies d'assistance. */
  readonly labels = input.required<readonly string[]>();

  /** Le nom du groupe de points. */
  readonly dotsLabel = input.required<string>();

  protected readonly active = signal(0);

  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  /** La position fait foi : on la LIT, on ne la suppose pas. */
  protected onScroll(): void {
    const el = this.track().nativeElement;
    const span = el.scrollWidth - el.clientWidth;
    const count = this.labels().length;
    if (span <= 0 || count < 2) {
      this.active.set(0);
      return;
    }
    this.active.set(Math.round((el.scrollLeft / span) * (count - 1)));
  }

  protected go(index: number): void {
    const el = this.track().nativeElement;
    const panel = el.children.item(index);
    panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }
}
