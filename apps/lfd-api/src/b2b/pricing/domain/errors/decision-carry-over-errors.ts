/**
 * **Les refus du REPORT d'une décision tarifaire** — règle, plancher, barème,
 * engagement, gabarit — sur la référence née d'un détachement
 * (`documentation/pricing/plan-report-apres-detachement.md`, § 3).
 *
 * Lus par le staff sur la fiche produit, pas par quelqu'un qui a le code sous
 * les yeux : chacun nomme le cas et le geste de sortie. `NotDetachedFromError`
 * (la filiation) est partagé avec le report de mercuriale et vit à côté.
 */

import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** Le jour civil, pour les messages : « 2026-11-01 ». */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** La famille, dite au staff. Des valeurs de donnée, traduites ici. */
const FAMILY_WORDS: Readonly<Record<string, string>> = {
  price_rule: "une règle de prix",
  price_floor: "un plancher",
  volume_ladder: "un barème de volume",
  volume_commitment: "un engagement de volume",
  price_template: "un gabarit",
};

function familyWord(family: string): string {
  return FAMILY_WORDS[family] ?? "une décision";
}

/**
 * **Déjà reportée.** Une décision de la même famille, en vigueur ou
 * programmée, vient déjà de l'ancienne référence sur la nouvelle, pour la même
 * audience. La clé n'est pas l'identifiant d'origine : un plancher versionné en
 * change à chaque période, et le même report passerait deux fois.
 */
export class DecisionAlreadyCarriedError extends BusinessError {
  constructor(
    readonly family: string,
    readonly fromSku: string,
    readonly toSku: string,
  ) {
    super(
      "pricing.carry_over.already_carried",
      `Une décision de « ${fromSku} » (${familyWord(family)}) a déjà été reportée sur « ${toSku} » pour la même clientèle : il n'y a rien de plus à reporter. Rechargez la liste des décisions ; pour changer la décision reportée, modifiez-la sur la nouvelle référence.`,
    );
  }
}

/**
 * **Rien à reporter** : l'ancienne décision est archivée, ou sa fin réelle est
 * passée. Pendant de `NoNegotiatedLineToCarryError` pour la mercuriale.
 */
export class CarriedDecisionClosedError extends BusinessError {
  constructor(
    readonly family: string,
    readonly decisionId: string,
  ) {
    super(
      "pricing.carry_over.decision_closed",
      `La décision ${decisionId} (${familyWord(family)}) est terminée ou archivée : il n'y a plus rien à reporter. Rechargez la liste des décisions.`,
    );
  }
}

/** **La décision à reporter n'existe pas.** */
export class CarriedDecisionNotFoundError extends ResourceNotFoundError {
  constructor(
    readonly family: string,
    readonly decisionId: string,
  ) {
    super(
      "pricing.carry_over.decision_not_found",
      `Aucune décision ${decisionId} à reporter (${familyWord(family)}). Rechargez la liste des décisions.`,
    );
  }
}

/**
 * **La décision ne nomme pas l'ancienne référence.** Reporter une décision de
 * famille, ou celle d'un autre article, serait une pose déguisée.
 */
export class DecisionNotOnReferenceError extends BusinessError {
  constructor(
    readonly decisionId: string,
    readonly fromSku: string,
  ) {
    super(
      "pricing.carry_over.not_on_reference",
      `La décision ${decisionId} ne porte pas sur la référence « ${fromSku} » : elle ne se reporte pas depuis elle. Rechargez la liste des décisions de l'ancienne référence.`,
    );
  }
}

/**
 * **Un report ne commence jamais dans le passé.** Une lecture datée d'hier ne
 * doit pas changer : la décision reportée part de maintenant au plus tôt.
 * Aucune porte ne le tient (`lint:dated-decisions` juge la forme) — c'est la
 * fabrique du domaine qui refuse.
 */
export class RetroactiveCarryOverError extends DomainError {
  constructor(readonly validFrom: Date) {
    super(
      "pricing.carry_over.retroactive",
      `Un report ne prend effet que pour l'avenir : le ${isoDay(validFrom)} est déjà passé. Relancez le report, il partira de maintenant.`,
    );
  }
}

/**
 * **Un plancher arbitre déjà la nouvelle référence** pour cette clientèle. Le
 * report ne remplace jamais : il écraserait sans bruit une protection posée
 * exprès.
 */
export class FloorAlreadyInForceError extends BusinessError {
  constructor(
    readonly toSku: string,
    readonly clientele: string,
  ) {
    super(
      "pricing.carry_over.floor_in_force",
      `La référence « ${toSku} » a déjà un plancher en vigueur pour la clientèle ${clientele} : le report ne le remplace pas. Pour le changer, posez le plancher voulu depuis l'écran des limites de prix.`,
    );
  }
}
