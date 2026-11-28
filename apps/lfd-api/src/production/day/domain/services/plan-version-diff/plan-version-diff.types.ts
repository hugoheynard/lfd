import type { SaleUnit } from "@lfd/money";

import type {
  PlanEntry,
  PlanVersionAuthor,
  PlanVersionCause,
} from "../../entities/plan-version.content.js";

/**
 * **Ce que rend la comparaison de deux versions du plan**
 * (`documentation/fournil/les-versions-du-plan.md`) —
 * une structure, jamais du texte : l'écran des versions et l'e-mail du
 * réenvoi la mettent en mots chacun de son côté, sur les mêmes faits.
 */

/** La version qui a fait un changement : laquelle, pourquoi, quand, qui. */
export interface PlanVersionMark {
  readonly version: number;
  readonly cause: PlanVersionCause;
  readonly recordedAt: Date;
  readonly recordedBy: PlanVersionAuthor;
  /** L'arrêt auquel elle appartient : il change après une réouverture. */
  readonly closedAt: Date;
}

/**
 * L'effet sur la production d'un article, lu sur le compte des deux versions
 * (§ 1.17) — des pièces, ou des grammes quand `saleUnit = "weight"`.
 */
export interface ProductionEffect {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: SaleUnit;
  readonly before: number;
  readonly after: number;
  readonly delta: number;
}

/**
 * L'envoi concerné. `reference` et `customerLabel` sont `null` pour une
 * retirée qu'aucune des deux versions comparées ne porte au plan.
 */
export interface ShipmentRef {
  readonly orderId: string;
  readonly rank: number;
  readonly reference: string | null;
  readonly customerLabel: string | null;
}

/** Une ligne d'un envoi dont la quantité a changé, sommée par article. */
export interface LineChange {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: SaleUnit;
  readonly before: number;
  readonly after: number;
}

/**
 * Pourquoi un envoi est entré, prêt à dire. Après une réouverture, l'entrée
 * l'emporte sur « hors plan » (§ 1.7) : `rearrested_off_plan` se dit
 * « refigée après réouverture (reçue hors plan) ».
 */
export type EntryReason =
  "arrested" | "retaken" | "retaken_off_plan" | "rearrested" | "rearrested_off_plan" | "unknown";

/** Un changement expliqué d'un envoi, attribué à la version qui l'a fait. */
export type ShipmentChange =
  | {
      readonly kind: "entered";
      readonly shipment: ShipmentRef;
      readonly by: PlanVersionMark;
      readonly entry: PlanEntry;
      readonly offPlan: boolean | null;
      readonly reason: EntryReason;
    }
  | {
      /** Lignes changées par une version `order_revised`. */
      readonly kind: "revised";
      readonly shipment: ShipmentRef;
      readonly by: PlanVersionMark;
      readonly lines: readonly LineChange[];
    }
  | {
      /** Lignes changées à travers une réouverture, sans version `order_revised` (§ 1.20). */
      readonly kind: "modified_during_reopen";
      readonly shipment: ShipmentRef;
      readonly by: PlanVersionMark;
      readonly lines: readonly LineChange[];
    }
  | {
      /** Lignes changées par un autre geste, au même arrêt : aucun ne le fait aujourd'hui. */
      readonly kind: "lines_changed";
      readonly shipment: ShipmentRef;
      readonly by: PlanVersionMark;
      readonly lines: readonly LineChange[];
    }
  | {
      /** « Annulée après l'arrêt, toujours produite » : inscrite au registre des retraits. */
      readonly kind: "withdrawn";
      readonly shipment: ShipmentRef;
      readonly by: PlanVersionMark;
      readonly withdrawnAt: string;
      /** L'auteur du retrait ; `null` pour un retrait d'avant les versions. */
      readonly withdrawnBy: PlanVersionAuthor | null;
    }
  | {
      /** Une retirée que le nouvel arrêt écarte : sortie, et la raison est connue. */
      readonly kind: "left_after_withdrawal";
      readonly shipment: ShipmentRef;
      readonly by: PlanVersionMark;
    };

/** Un réassort lancé, entré au plan ou sorti du plan. */
export interface ResupplyChange {
  readonly kind: "launched" | "entered" | "left";
  readonly resupplyId: string;
  readonly siteLabel: string | null;
  readonly name: string | null;
  readonly by: PlanVersionMark;
}

/** La gravité d'une sortie inexpliquée : à vérifier (l'orange de l'écran). */
export const TO_CHECK = "to_check";

/**
 * Un envoi absent de la version suivante sans être au registre des retraits :
 * la raison est au commerce (paiement, vitrine, date, manque décidé — § 1.19).
 */
export interface UnexplainedExit {
  readonly kind: "left_reason_at_commerce";
  readonly severity: typeof TO_CHECK;
  readonly shipment: ShipmentRef;
  readonly by: PlanVersionMark;
}

/** La comparaison de `from` à `to`. */
export interface PlanVersionDiff {
  readonly from: PlanVersionMark;
  readonly to: PlanVersionMark;
  /**
   * `from` est la première version d'une journée arrêtée avant qu'on garde
   * les versions : on ne sait pas comment ses envois sont entrés, et le diff
   * ne remonte pas avant elle.
   */
  readonly baselineUnknown: boolean;
  /** Par article, les seuls qui changent, rangés par SKU. */
  readonly production: readonly ProductionEffect[];
  /** Dans l'ordre des versions, puis des envois. */
  readonly changes: readonly ShipmentChange[];
  readonly resupplies: readonly ResupplyChange[];
  /** Classées à part : à vérifier. */
  readonly toCheck: readonly UnexplainedExit[];
}
