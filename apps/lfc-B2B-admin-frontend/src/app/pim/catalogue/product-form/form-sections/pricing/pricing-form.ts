import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import type { PriceBasis } from '@lfd/pim-contracts';

import { ChannelsForm } from '../channels/channels-form';
import { ProductFormStore } from '../../product-form-store';
import { numberValue } from '../dom';

/**
 * Panneau Tarif & TVA — le **prix public TTC**, ce qu'il devient pour les
 * professionnels, et les hors taxe qu'il produit contexte par contexte.
 *
 * Le régime était une section à part. Le lire demandait de replier celle-ci pour
 * déplier l'autre, alors que « 24,50 » et « TVA 5,5 % » sont une seule
 * information : ce qu'on facture. La maquette les met côte à côte, et elle a
 * raison.
 *
 * Le sens de lecture s'est INVERSÉ : on saisissait un hors taxe et l'écran
 * montrait les TTC ; on saisit le prix d'étiquette et l'écran montre les hors
 * taxe, un par taux. C'est la même page, lue depuis l'autre bout — et c'est le
 * bout par lequel une vitrine se pense.
 */
@Component({
  selector: 'app-pricing-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChannelsForm],
  templateUrl: './pricing-form.html',
  styleUrls: ['../form-section.scss', './pricing-form.scss'],
})
export class PricingForm {
  protected readonly store = inject(ProductFormStore);
  protected readonly numberValue = numberValue;

  /**
   * Les deux assiettes, avec le mot qu'on emploie pour chacune.
   *
   * Dérivées de `PRICE_BASES` plutôt que réécrites : une assiette ajoutée au
   * contrat ne compilerait pas ici tant qu'elle n'a pas son libellé — c'est le
   * compilateur qui tient l'écran à jour, pas la vigilance.
   */
  protected readonly BASES: readonly { value: PriceBasis; label: string }[] = BASIS_ORDER.map(
    (value) => ({ value, label: BASIS_LABELS[value] }),
  );
}

/**
 * L'ordre d'AFFICHAGE, et non celui du contrat.
 *
 * Le prix public TTC vient en tête parce que c'est le mode par défaut — celui
 * dans lequel une fiche neuve naît, et celui que la maison a choisi. Reprendre
 * l'ordre de `PRICE_BASES` mettrait le hors taxe en premier et le ferait lire
 * comme le choix normal ; cet ordre-là sert l'enum et la base, où `ht` est le
 * défaut pour protéger les lignes existantes. Deux ordres, deux raisons.
 *
 * Le typage garde la garantie : `BASIS_ORDER` est un tuple de `PriceBasis` et
 * `BASIS_LABELS` un `Record` complet — une assiette ajoutée au contrat ne
 * compile pas tant qu'elle n'a ni libellé ni place.
 */
const BASIS_ORDER: readonly PriceBasis[] = ['ttc', 'ht'];

const BASIS_LABELS: Readonly<Record<PriceBasis, string>> = {
  ttc: 'un prix public TTC',
  ht: 'un prix hors taxe',
};
