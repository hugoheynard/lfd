import {
  TYPICAL_BUYER,
  type BuyerAudienceFacts,
  type PricedBuyerKind,
} from "./promotion-targeting.js";

/**
 * **L'acheteur d'un lot, tel que la porte du prix le connaît** — établi au
 * serveur, jamais reçu (`plan-export-grille-de-prix.md`, § 8.1).
 *
 * Deux sortes, et seulement deux :
 *
 * - `real` — une société réelle (ou aucune), et la porte d'entrée posée par la
 *   route. Ses faits d'audience se lisent en base.
 * - `typical` — un acheteur **déclaré par le staff**, qui n'est aucune société :
 *   le « pro type » de la grille de prix. Ses faits sont construits en amont.
 */
export interface RealLotBuyer {
  readonly kind: "real";
  /** La société servie ; `null` = particulier, ou le tableau général. */
  readonly companyId: string | null;
  readonly buyerKind: PricedBuyerKind;
}

/** Les clientèles qu'un acheteur type sait représenter (§ 8.5) : deux pros. */
export type TypicalClientele = "pro_active" | "pro_pending";

/** La clientèle type → l'acheteur type de l'annonce, dont elle reprend les faits (§ 8.4). */
const TYPICAL_KEY = {
  pro_active: "b2b",
  pro_pending: "b2bPending",
} as const satisfies Record<TypicalClientele, keyof typeof TYPICAL_BUYER>;

/**
 * **Un pro type** — objet OPAQUE (§ 8.1).
 *
 * Une valeur d'une union de chaînes s'écrirait depuis n'importe quelle route,
 * et `?audience=pro` publierait alors une promotion réservée. Ici, le
 * constructeur est privé et le champ des faits aussi : la classe est nominale,
 * un littéral ne la contrefait pas. La seule fabrique est {@link TypicalBuyer.of},
 * et `lint:typical-buyer` refuse qu'on importe ce fichier en VALEUR ailleurs que
 * dans `lafoliecoffee/pricing/application/price-grid-*` — l'export staff, sous
 * `b2b_pricing:read`. Les autres le lisent en `import type`.
 */
export class TypicalBuyer {
  readonly kind = "typical";

  private constructor(
    readonly clientele: TypicalClientele,
    private readonly declared: BuyerAudienceFacts,
  ) {}

  static of(clientele: TypicalClientele): TypicalBuyer {
    return new TypicalBuyer(clientele, TYPICAL_BUYER[TYPICAL_KEY[clientele]]);
  }

  /** Ses faits d'audience : un statut type, aucune société, porte inconnue. */
  get facts(): BuyerAudienceFacts {
    return this.declared;
  }
}

export type LotBuyer = RealLotBuyer | TypicalBuyer;
