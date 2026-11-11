import type {
  CompanyMercurialeLinePayload,
  PoseCompanyMercurialePayload,
  SaveMercurialeDraftPayload,
  SavePriceTemplatePayload,
} from '@lfd/contracts';
import type { FoldTableColumn, FoldTableEmpty, FoldTableTone } from 'fold-ng';

import { businessDayStart } from '../../shared/business-day';
import {
  discountPayload,
  discountProblem,
  discountViewOf,
  type GeneralDiscountForm,
} from './general-discount-form';
import { policyPayload, policyProblem, type PromotionPolicyForm } from './promotion-policy';
import type { FilteredTarifRow } from './tarif-filter';
import type { TarifRow } from './tarif-shelves';

/**
 * **Une mercuriale en composition, côté écran** : quand elle peut se poser,
 * les corps qui partent (poser, brouillon, gabarit) et les colonnes de sa
 * grille. Pur — les gestes et leurs messages restent au composant.
 */

/** Ce qu'on s'apprête à poser. Les jours sont en `AAAA-MM-JJ`, vides si non saisis. */
export interface Composition {
  readonly label: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly lines: readonly CompanyMercurialeLinePayload[];
  readonly policy: PromotionPolicyForm;
  readonly discount: GeneralDiscountForm | null;
}

/**
 * Un nom, une date de début, au moins un prix ferme ou une remise complète,
 * et une politique de promotions que le domaine accepte.
 */
export function canPoseComposition(composition: Composition): boolean {
  return (
    composition.label.trim() !== '' &&
    composition.validFrom !== '' &&
    (composition.lines.length > 0 || discountViewOf(composition.discount) !== null) &&
    discountProblem(composition.discount) === null &&
    policyProblem(composition.policy) === null
  );
}

function discountBody(composition: Composition) {
  return composition.discount === null ? null : discountPayload(composition.discount);
}

/**
 * `2026-01-01` → l'instant ISO de minuit **à Paris**, ou `null` si le champ est
 * vide.
 */
function isoDay(day: string): string | null {
  return day === '' ? null : businessDayStart(day);
}

/** Le corps de « Poser » : minuit à Paris, et sans fin quand le champ est vide. */
export function posePayload(composition: Composition): PoseCompanyMercurialePayload {
  return {
    label: composition.label.trim(),
    validFrom: businessDayStart(composition.validFrom) ?? '',
    validTo: isoDay(composition.validTo),
    lines: [...composition.lines],
    promotionPolicy: policyPayload(composition.policy),
    generalDiscount: discountBody(composition),
  };
}

/** Le corps du brouillon : il a le droit d'être incomplet — sans nom, sans dates, sans ligne. */
export function draftPayload(composition: Composition): SaveMercurialeDraftPayload {
  return {
    label: composition.label.trim(),
    validFrom: isoDay(composition.validFrom),
    validTo: isoDay(composition.validTo),
    lines: [...composition.lines],
    promotionPolicy: policyPayload(composition.policy),
    generalDiscount: discountBody(composition),
  };
}

/**
 * Ce qui empêche de garder la grille comme gabarit, ou `null`. Le refus nomme
 * **ce qui manque**, et les deux causes se disent séparément : on nomme sa
 * mercuriale avant d'avoir tapé un prix, et une phrase unique accuserait le
 * seul champ rempli.
 */
export function templateRefusal(
  label: string,
  lines: readonly CompanyMercurialeLinePayload[],
): string | null {
  if (label.trim() === '') {
    return 'Nommez la grille avant de la garder comme gabarit.';
  }
  if (lines.length === 0) {
    return 'Aucun prix saisi : un gabarit vide ne se repose nulle part. Renseignez au moins un article.';
  }
  return null;
}

/**
 * La grille sous la forme des gabarits — un palier à partir de 1 par article —,
 * parce que c'est ce qu'un gabarit stocke : la même grille, écrite dans la
 * forme que l'autre écran sait relire.
 */
export function templatePayload(
  label: string,
  lines: readonly CompanyMercurialeLinePayload[],
): SavePriceTemplatePayload {
  return {
    kind: 'mercuriale',
    label: label.trim(),
    lines: lines.map((line) => ({
      sku: line.sku,
      tiers: [{ minQuantity: 1, unitPriceMillicents: line.unitPriceMillicents }],
      plannedVolume: null,
    })),
  };
}

/** Ce dont dépendent les colonnes de la grille. */
export interface ComposerColumnsInput {
  /** Le filtre montre toutes les familles. */
  readonly allShelves: boolean;
  /** Une mercuriale en cours fixe déjà un prix négocié. */
  readonly negotiated: boolean;
  /** Au moins un prix ferme est saisi. */
  readonly hasFirmPrices: boolean;
}

/**
 * Les colonnes, de gauche à droite comme la négociation se mène. Aucune n'est
 * triable : l'ordre du catalogue est le seul repère pour retrouver un article
 * deux minutes plus tard, et le perdre coûte plus qu'un tri ne rapporte.
 *
 * « Sans mercuriale » n'est dit que si aucune ne fixe déjà un prix ; l'effort
 * compare au prix ferme sur chaque ligne où l'on en a tapé un (`liveEffort`).
 */
export function composerColumns(
  input: ComposerColumnsInput,
): readonly FoldTableColumn<FilteredTarifRow>[] {
  return [
    { key: 'article', label: 'Article' },
    // En « Toutes », la famille garde le repère qu'avaient les tables par rayon.
    ...(input.allShelves ? [{ key: 'shelf', label: 'Famille', width: '10rem' }] : []),
    { key: 'catalog', label: 'Prix base pro HT (sans réductions)', width: '10rem' },
    {
      key: 'current',
      label: input.negotiated ? 'Prix de ce client HT' : 'Prix de ce client HT (sans mercuriale)',
      width: '10rem',
    },
    { key: 'limit', label: 'Limite', width: '8rem' },
    { key: 'price', label: 'Prix ferme', width: '12rem' },
    { key: 'room', label: 'Marge de négoce', width: '9rem' },
    {
      key: 'effort',
      label: input.hasFirmPrices
        ? 'Effort de vente (prix base / prix ferme, sinon prix de ce client)'
        : 'Effort de vente (prix base / prix de ce client)',
      width: '12rem',
    },
  ];
}

/** La grille quand le filtre ne laisse rien. */
export const COMPOSER_EMPTY: FoldTableEmpty = {
  title: 'Aucun article ne correspond au filtre',
  subtitle: 'Changez de famille, effacez la recherche ou décochez « Seulement les prix fermes ».',
};

/**
 * **Le ton de ligne dit que le prix saisi ne sera pas celui facturé.**
 *
 * Ambre quand la limite a relevé la saisie — le seul fait de cette table qui
 * appelle un geste, et le seul moyen de le retrouver dans quatre-vingt-douze
 * lignes. Il est aussi **écrit** dans la cellule, donc la couleur ne le porte
 * jamais seule.
 */
export function composerRowTone(row: TarifRow): FoldTableTone {
  return row.floored ? 'warning' : null;
}
