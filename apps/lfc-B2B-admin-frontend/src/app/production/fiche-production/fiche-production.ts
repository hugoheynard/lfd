import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ORDER_ORIGIN_LABELS, type ProductionSheet } from '@lfd/contracts';

/**
 * Une **fiche de fonction** : une commande, sur une feuille A4.
 *
 * Composant à part et non un bloc du gabarit de page : la même feuille servira
 * au tirage à la clôture et, le jour où on l'ajoutera, à l'impression
 * automatique à l'arrivée d'une commande. Deux gabarits de fiche divergeraient,
 * et c'est celui qu'on regarde le moins qui aurait tort.
 *
 * Ce qu'elle porte : le client, l'acheminement, les lignes. **Aucun montant** —
 * on fabrique ici, et une feuille oubliée sur un plan de travail n'a pas à
 * raconter les prix de la maison.
 */
@Component({
  selector: 'app-fiche-production',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fiche-production.html',
  styleUrl: './fiche-production.scss',
})
export class FicheProduction {
  readonly sheet = input.required<ProductionSheet>();
  /** Le rang dans la pile — « 3 » de « fiche 3/14 ». */
  readonly rank = input.required<number>();
  /** La taille de la pile. Sans elle, un rang seul ne prouve rien. */
  readonly total = input.required<number>();
  /** Le jour de service, déjà mis en forme par la page. */
  readonly dayLabel = input.required<string>();

  /** « Retrait » ou « Livraison » — le premier mot que cherche celui qui prépare. */
  protected readonly methodLabel = computed(() =>
    this.sheet().fulfillmentMethod === 'pickup' ? 'Retrait' : 'Livraison',
  );

  /**
   * Où ça va, en une ligne : le point de retrait nommé, ou l'adresse servie.
   * `null` quand la commande est un retrait au point par défaut — la fiche dit
   * alors « Retrait » et rien de plus, ce qui est exact.
   */
  protected readonly destination = computed<string | null>(() => {
    const sheet = this.sheet();
    if (sheet.fulfillmentMethod === 'pickup') {
      return sheet.pickupLabel;
    }
    const address = sheet.deliveryAddress;
    if (address === null) {
      return null;
    }
    const street = [address.ligne1, address.ligne2].filter((part) => part !== '').join(', ');
    return `${street} — ${address.codePostal} ${address.ville}`;
  });

  /** L'origine n'est dite QUE si elle apprend quelque chose au labo. */
  protected readonly originLabel = computed<string | null>(() =>
    this.sheet().origin === 'recurring' ? ORDER_ORIGIN_LABELS.recurring : null,
  );

  /** Le nombre de pièces de la fiche — de quoi recompter le colis sans additionner. */
  protected readonly pieces = computed(() =>
    this.sheet().lines.reduce((sum, line) => sum + line.quantity, 0),
  );
}
