import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ORDER_ORIGIN_LABELS, type ProductionSheet } from '@lfd/contracts';

/**
 * Une **fiche de fonction** : une commande, sur une feuille A4.
 *
 * Composant à part et non un bloc du gabarit de page : la même feuille servira
 * au tirage à la clôture et, le jour où on l'ajoutera, à l'impression
 * automatique à l'arrivée d'une commande. Deux gabarits divergeraient, et c'est
 * celui qu'on regarde le moins qui aurait tort.
 *
 * **Rendu pur.** Tout ce qui se décide — l'enseigne contre la raison sociale,
 * la chaîne du contact de livraison, l'adresse du point de retrait — est résolu
 * au serveur dans `ProductionSheet`. Ce composant met en forme, il ne choisit
 * rien : une règle métier écrite ici ne serait ni testée avec le reste, ni
 * réutilisée par l'impression automatique.
 *
 * Ce qu'elle porte : qui, où, quoi. **Aucun montant** — on fabrique ici, et une
 * feuille oubliée sur un plan de travail n'a pas à raconter les prix.
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

  /** « RETRAIT » ou « LIVRAISON » — le premier mot que cherche celui qui prépare. */
  protected readonly methodLabel = computed(() =>
    this.sheet().fulfillmentMethod === 'pickup' ? 'Retrait' : 'Livraison',
  );

  /**
   * L'adresse d'acheminement, en lignes prêtes à poser. Le point de retrait ou
   * l'adresse servie selon le mode — la fiche n'a pas à savoir laquelle des deux
   * le serveur a remplie, elle prend celle du mode.
   */
  protected readonly addressLines = computed<readonly string[]>(() => {
    const sheet = this.sheet();
    const address =
      sheet.fulfillmentMethod === 'pickup' ? sheet.pickupAddress : sheet.deliveryAddress;
    if (address === null) {
      return [];
    }
    return [address.ligne1, address.ligne2, `${address.codePostal} ${address.ville}`.trim()].filter(
      (line) => line !== '',
    );
  });

  /** L'origine n'est dite QUE si elle apprend quelque chose au labo. */
  protected readonly originLabel = computed<string | null>(() =>
    this.sheet().origin === 'recurring' ? ORDER_ORIGIN_LABELS.recurring : null,
  );

  /** Le nombre de pièces — de quoi recompter le colis sans additionner. */
  protected readonly pieces = computed(() =>
    this.sheet().lines.reduce((sum, line) => sum + line.quantity, 0),
  );
}
