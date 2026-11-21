import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * **L'intitulé d'un bloc de commande** — petites capitales grises et
 * discrètes, celles de « Avancement » et « Montants ».
 *
 * Une seule source pour ce style : le détail partagé (boutique et
 * back-office) et les cartes de l'onglet « Détail » du back-office le
 * composent, au lieu de recopier ses déclarations. Aucune variante de
 * `fold-element-title` ne le rend tel quel (`caps` est plus appuyé).
 */
@Component({
  selector: 'lfd-section-title',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './section-title.html',
  styleUrl: './section-title.scss',
})
export class SectionTitle {
  readonly title = input.required<string>();
  /** Une précision sous l'intitulé, plus discrète encore. */
  readonly subtitle = input<string | null>(null);
  /** L'`id` du titre, pour un `aria-labelledby` voisin. */
  readonly headingId = input<string | null>(null);
}
