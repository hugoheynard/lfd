import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldNumberInputComponent } from 'fold-ng';
import { MILLICENTS_PER_CENT } from '@lfd/money';

/** 10⁵ — d'un millicentime à l'euro. Dérivé une fois, jamais réécrit en dur. */
const MILLICENTS_PER_EURO = 100 * MILLICENTS_PER_CENT;

/**
 * **La saisie d'un prix ferme dans une cellule de table** — le champ en euros,
 * et sous lui un lien au poids d'une aide : « partir du catalogue » sur un
 * champ vide, « retirer ce prix » sinon. Partagée par la composition et
 * l'avenant.
 *
 * Le pas est de 0,10 € parce que c'est l'unité d'une négociation ; la saisie
 * libre reste ouverte à cinq décimales, d'où l'absence de `snapToStep`.
 * Pas d'étiquette : la table donne le contexte par ses en-têtes.
 */
@Component({
  selector: 'app-firm-price-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldNumberInputComponent],
  templateUrl: './firm-price-field.html',
  styleUrl: './firm-price-field.scss',
})
export class FirmPriceField {
  /** Le prix saisi, en euros ; `null` = pas de prix ferme. */
  readonly euros = input.required<number | null>();
  readonly catalogMillicents = input.required<number>();
  /** Le nouveau prix en euros ; `null` = le prix est retiré. */
  readonly eurosChange = output<number | null>();

  protected fromCatalog(): void {
    this.eurosChange.emit(this.catalogMillicents() / MILLICENTS_PER_EURO);
  }
}
