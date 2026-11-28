import { z } from "zod";

/**
 * **Les versions du plan d'une journée, telles que le back-office les lit**
 * (`documentation/fournil/plan-historique-des-tirages.md`) — la liste
 * (`GET admin/production/batch/:date/plan-versions`), la comparaison de deux
 * versions (`…/plan-versions/compare?from=&to=`) et les envois du dossier
 * (`…/plan-versions/dispatches`). Des structures, jamais du texte : l'écran
 * les met en mots. Les instants sont des chaînes ISO.
 */

/** Pourquoi une version a été écrite : le geste qui a changé le plan. */
export type PlanVersionCause =
  | "closed"
  | "auto_closed"
  | "retaken"
  | "order_revised"
  | "order_withdrawn"
  | "resupply_launched"
  | "opened_by_resupply";

/**
 * Qui a fait le geste. `name` du staff : le nom figé au geste, sinon celui de
 * l'annuaire aujourd'hui, sinon `null` (l'écran dit « l'équipe »). L'écran
 * dit « le client » pour `customer` et `guest`, « automatique » pour `system`.
 */
export type PlanVersionAuthorView =
  | { readonly kind: "staff"; readonly staffId: string; readonly name: string | null }
  | { readonly kind: "customer" }
  | { readonly kind: "guest" }
  | { readonly kind: "system" };

/** Comment un envoi est entré au plan, déduit de la version précédente. */
export type PlanEntry = "arrested" | "retaken" | "arrested_after_reopen" | "unchanged" | "unknown";

/** L'unité d'une quantité : des pièces, ou des grammes. */
export type PlanVersionSaleUnit = "piece" | "weight";

/**
 * « Papier rangé ou non », lu au stockage. `version` : celle dont le papier
 * sert — elle-même, ou la précédente pour un retrait ; `null` : aucune.
 * `dossier` / `count` : `true` rangé, `false` non rangé, `null` le stockage
 * n'a pas répondu (on ne sait pas).
 */
export interface PlanVersionPaperView {
  readonly version: number | null;
  readonly dossier: boolean | null;
  readonly count: boolean | null;
}

/** Une ligne de la liste des versions. */
export interface PlanVersionView {
  readonly version: number;
  readonly cause: PlanVersionCause;
  readonly recordedAt: string;
  readonly author: PlanVersionAuthorView;
  /** L'arrêt auquel la version appartient : il change après une réouverture. */
  readonly closedAt: string;
  readonly printRun: number;
  readonly shipmentCount: number;
  readonly paper: PlanVersionPaperView;
}

/**
 * La version qui a fait un changement. Ses auteurs ne sont pas nommés par
 * l'annuaire : l'écran les relit dans la liste, par numéro de version.
 */
export interface PlanVersionMarkView {
  readonly version: number;
  readonly cause: PlanVersionCause;
  readonly recordedAt: string;
  readonly recordedBy: PlanVersionAuthorView;
  readonly closedAt: string;
}

/** L'effet sur la production d'un article, lu sur le compte des deux versions. */
export interface PlanVersionProductionEffect {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: PlanVersionSaleUnit;
  readonly before: number;
  readonly after: number;
  readonly delta: number;
}

/**
 * L'envoi concerné. `reference` et `customerLabel` sont `null` pour une
 * retirée qu'aucune des deux versions comparées ne porte au plan.
 */
export interface PlanVersionShipmentRef {
  readonly orderId: string;
  readonly rank: number;
  readonly reference: string | null;
  readonly customerLabel: string | null;
}

/** Une ligne d'un envoi dont la quantité a changé, sommée par article. */
export interface PlanVersionLineChange {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: PlanVersionSaleUnit;
  readonly before: number;
  readonly after: number;
}

/**
 * Pourquoi un envoi est entré, prêt à dire. Après une réouverture, l'entrée
 * l'emporte sur « hors plan » : `rearrested_off_plan` se dit « refigée après
 * réouverture (reçue hors plan) ».
 */
export type PlanVersionEntryReason =
  "arrested" | "retaken" | "retaken_off_plan" | "rearrested" | "rearrested_off_plan" | "unknown";

/** Un changement expliqué d'un envoi, attribué à la version qui l'a fait (`by`). */
export type PlanVersionShipmentChangeView =
  | {
      readonly kind: "entered";
      readonly shipment: PlanVersionShipmentRef;
      readonly by: PlanVersionMarkView;
      readonly entry: PlanEntry;
      readonly offPlan: boolean | null;
      readonly reason: PlanVersionEntryReason;
    }
  | {
      /** Lignes changées par une version `order_revised`. */
      readonly kind: "revised";
      readonly shipment: PlanVersionShipmentRef;
      readonly by: PlanVersionMarkView;
      readonly lines: readonly PlanVersionLineChange[];
    }
  | {
      /** Lignes changées à travers une réouverture, sans version `order_revised`. */
      readonly kind: "modified_during_reopen";
      readonly shipment: PlanVersionShipmentRef;
      readonly by: PlanVersionMarkView;
      readonly lines: readonly PlanVersionLineChange[];
    }
  | {
      /** Lignes changées par un autre geste, au même arrêt. */
      readonly kind: "lines_changed";
      readonly shipment: PlanVersionShipmentRef;
      readonly by: PlanVersionMarkView;
      readonly lines: readonly PlanVersionLineChange[];
    }
  | {
      /** « Annulée après l'arrêt, toujours produite » : inscrite au registre des retraits. */
      readonly kind: "withdrawn";
      readonly shipment: PlanVersionShipmentRef;
      readonly by: PlanVersionMarkView;
      readonly withdrawnAt: string;
      /** L'auteur du retrait ; `null` pour un retrait d'avant les versions. */
      readonly withdrawnBy: PlanVersionAuthorView | null;
    }
  | {
      /** Une retirée que le nouvel arrêt écarte : sortie, et la raison est connue. */
      readonly kind: "left_after_withdrawal";
      readonly shipment: PlanVersionShipmentRef;
      readonly by: PlanVersionMarkView;
    };

/** Un réassort lancé, entré au plan ou sorti du plan. */
export interface PlanVersionResupplyChangeView {
  readonly kind: "launched" | "entered" | "left";
  readonly resupplyId: string;
  readonly siteLabel: string | null;
  readonly name: string | null;
  readonly by: PlanVersionMarkView;
}

/**
 * Un envoi absent de la version suivante sans être au registre des retraits :
 * la raison est au commerce (paiement, vitrine, date, manque décidé). « À
 * vérifier », jamais une accusation.
 */
export interface PlanVersionUnexplainedExitView {
  readonly kind: "left_reason_at_commerce";
  readonly severity: "to_check";
  readonly shipment: PlanVersionShipmentRef;
  readonly by: PlanVersionMarkView;
}

/** La comparaison de `from` à `to`. */
export interface PlanVersionDiffView {
  readonly from: PlanVersionMarkView;
  readonly to: PlanVersionMarkView;
  /** `from` est la première version d'une journée arrêtée avant qu'on garde les versions. */
  readonly baselineUnknown: boolean;
  /** Par article, les seuls qui changent, rangés par SKU. */
  readonly production: readonly PlanVersionProductionEffect[];
  /** Dans l'ordre des versions, puis des envois. */
  readonly changes: readonly PlanVersionShipmentChangeView[];
  readonly resupplies: readonly PlanVersionResupplyChangeView[];
  readonly toCheck: readonly PlanVersionUnexplainedExitView[];
}

/** Un envoi du dossier, tel que l'écran le date. */
export interface DossierDispatchMarkView {
  readonly at: string;
  /** `null` : envoi d'avant les versions. */
  readonly planVersion: number | null;
}

/** L'issue d'un envoi du dossier. */
export type DossierDispatchOutcome = "pending" | "sent" | "failed";

/**
 * Un destinataire du dossier aujourd'hui, et ce qu'il a reçu de la journée.
 * `lastReceived` : le dernier envoi parti (`sent`) ; `lastAttempt` : le
 * dernier envoi, quelle qu'en soit l'issue.
 */
export interface DossierDispatchView {
  readonly recipientId: string;
  readonly name: string;
  readonly lastReceived: DossierDispatchMarkView | null;
  readonly lastAttempt:
    (DossierDispatchMarkView & { readonly outcome: DossierDispatchOutcome }) | null;
}

/** Un numéro de version, lu dans l'URL : un entier positif. */
const versionNumber = z.coerce
  .number()
  .int("un numéro de version est un entier")
  .min(1, "les versions se numérotent à partir de 1");

/**
 * **Les deux versions à comparer, lues dans l'URL** (`?from=&to=`) — la forme
 * seulement. Que `from` précède `to` et que les versions existent, c'est le
 * diff du noyau qui le juge (400 et 404, nommés).
 */
export const planVersionRangeQuerySchema = z.object({
  from: versionNumber,
  to: versionNumber,
});

export type PlanVersionRangeQuery = z.infer<typeof planVersionRangeQuerySchema>;
