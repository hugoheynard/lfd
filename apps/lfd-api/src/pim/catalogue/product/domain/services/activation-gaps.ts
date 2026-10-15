import { ROOT_CONTEXT_KEY } from "../../../../sales-contexts/domain/value-objects/bootstrap-contexts.js";
import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import { servedAudiences, type Audience } from "../../../shared/domain/value-objects/audience.js";
import type { ProPriceMethod } from "@lfd/pim-contracts";
import type { VariantSnapshot } from "../entities/variant.js";

/** Une clientèle servie, sans le `both` qui en regroupe deux. */
export type ServedAudience = ReturnType<typeof servedAudiences>[number];

/**
 * Le contexte de vente qui **facture** chaque clientèle (1e du plan
 * `plan-catalogue-synchronise-par-audience.md`) : le professionnel au régime
 * de la vente en ligne pro, le particulier au régime « à emporter ».
 *
 * La clé `takeaway` est une DONNÉE en base (`bootstrap-contexts.ts`), pas un
 * nom de code : elle se cite telle quelle.
 */
export const BILLING_CONTEXT_OF: Readonly<Record<ServedAudience, string>> = {
  pro: ROOT_CONTEXT_KEY,
  public: "takeaway",
};

/** Une clientèle visée qui n'a pas de taux au contexte qui la facture. */
export interface UnbilledAudience {
  readonly audience: ServedAudience;
  readonly contextKey: string;
}

/**
 * Ce qui empêche une fiche d'être activée, en plus des allergènes.
 *
 * Vide sur les deux listes = activable.
 */
export interface ActivationGaps {
  /**
   * Le prix pro HT saisi est exigé (méthode `entered`, lot P) : un « prix »
   * veut alors dire les DEUX prix, et le refus doit le dire.
   */
  readonly proPriceRequired: boolean;
  /**
   * Aucune déclinaison non arrêtée n'a de prix — y compris quand toutes sont
   * arrêtées, où la liste ci-dessous est vide sans que rien ne soit vendable.
   */
  readonly priceMissing: boolean;
  /**
   * Les déclinaisons non arrêtées **sans prix** — renseignée seulement quand
   * AUCUNE n'en a : une seule déclinaison tarifée suffit à vendre la fiche.
   */
  readonly unpricedVariantSkus: readonly string[];
  readonly unbilledAudiences: readonly UnbilledAudience[];
}

/**
 * **Ce qui manque pour vendre** — fonction pure, jugée sur les déclinaisons
 * RÉSOLUES (une déclinaison alignée porte le prix du défaut) et sur les taux
 * effectifs de la fiche, tels que la projection les lit (`vatPercents`).
 *
 * Pourquoi le taux arrive tout résolu : il dépend de la famille et du registre
 * des taux, que la fiche ne voit pas. Un objet ne garantit que ce qu'il voit ;
 * le handler lui montre le reste.
 */
export function activationGaps(
  variants: readonly VariantSnapshot[],
  vatPercents: CategoryVatPercents,
  audience: Audience,
  proPriceMethod: ProPriceMethod,
): ActivationGaps {
  const proPriceRequired = proPriceMethod === "entered";
  const live = variants.filter((variant) => !variant.isDiscontinued);
  const priced = live.some(
    (variant) =>
      variant.priceCents !== null && (!proPriceRequired || variant.proPriceMillicents !== null),
  );
  return {
    proPriceRequired,
    priceMissing: !priced,
    unpricedVariantSkus: priced ? [] : live.map((variant) => variant.sku),
    unbilledAudiences: servedAudiences(audience)
      .map((served) => ({ audience: served, contextKey: BILLING_CONTEXT_OF[served] }))
      .filter((gap) => vatPercents[gap.contextKey] === undefined),
  };
}

/** Rien ne manque ? */
export function isActivatable(gaps: ActivationGaps): boolean {
  return !gaps.priceMissing && gaps.unbilledAudiences.length === 0;
}
