import type { ProductionGrouping } from "./production-settings.js";

/**
 * **Une partie du dossier du jour** — ce que la fenêtre d'impression coche
 * (`documentation/fournil/dossier-prod-du-jour.md`).
 *
 * - `cover` : la couverture ;
 * - `recap` : le total à produire d'un rayon (ou d'un poste) ;
 * - `calendar` : sa page « par tranche horaire » ;
 * - `orders` : la fiche de chaque commande ;
 * - `deliveryNotes` : le BL de transport derrière elle ;
 * - `resupplies` : la fiche de chaque réassort ;
 * - `functionSheets` : les fiches de fonction des événements du jour, à la fin.
 */
export type ProductionDossierPart =
  "cover" | "recap" | "calendar" | "orders" | "deliveryNotes" | "resupplies" | "functionSheets";

/** Une commande que la fenêtre propose de cocher. */
export interface PrintOptionOrder {
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
}

/** Une impression provisoire de la journée, telle que la fenêtre la liste. */
export interface PrintOptionRun {
  readonly id: string;
  readonly run: number;
  /** ISO 8601. */
  readonly printedAt: string;
  /** « Prénom Nom », `null` : fiche inconnue ou sans nom. */
  readonly printedByName: string | null;
  /**
   * Une fiche de fonction imprimée par ce tirage a été remplacée ou retirée
   * depuis : « fiche de fonction remplacée depuis l'impression #N ».
   */
  readonly functionSheetsReplaced: boolean;
}

/** Une fiche de fonction en vigueur ce jour, que le dossier joint à la fin. */
export interface PrintOptionFunctionSheet {
  readonly sheetId: string;
  readonly fileName: string;
  readonly eventName: string;
}

/**
 * **L'état de la fenêtre d'impression du dossier**
 * (`GET /admin/production/batch/:date/print-options`).
 *
 * - `arrested` : le plan est arrêté — la fenêtre imprime des parties du
 *   dossier figé ; sinon, elle tire une impression provisoire ;
 * - `grouping` et `groups` : rayons (`shelf`) ou postes (`workstation`) du
 *   jour, dans l'ordre du dossier ;
 * - `orders` : celles du dossier figé, ou celles que l'arrêt figerait ;
 * - `prints` : les impressions provisoires du jour, par numéro croissant ;
 * - `changedSinceLast` : les commandes ont bougé au commerce depuis la
 *   dernière impression provisoire — toujours `false` sans impression, ou une
 *   fois le plan arrêté ;
 * - `functionSheets` : les fiches de fonction en vigueur du jour — la partie
 *   « Fiches de fonction » se coche par défaut quand il y en a. Toujours
 *   servi ; optionnel tant que la fenêtre ne le lit pas.
 */
export interface ProductionPrintOptionsView {
  readonly arrested: boolean;
  readonly grouping: ProductionGrouping;
  readonly groups: readonly string[];
  readonly orders: readonly PrintOptionOrder[];
  readonly prints: readonly PrintOptionRun[];
  readonly changedSinceLast: boolean;
  readonly functionSheets: readonly PrintOptionFunctionSheet[];
}

/** Les commandes d'une impression provisoire : toutes, depuis le tirage `run`, ou cochées. */
export type ProvisionalPrintOrders =
  | { readonly kind: "all" }
  | { readonly kind: "since"; readonly run: number }
  | { readonly kind: "chosen"; readonly orderIds: readonly string[] };

/**
 * **Le corps d'une impression provisoire**
 * (`POST /admin/production/batch/:date/provisional-print`, par intention).
 * `groups` : `"all"`, ou les libellés de rayons ou de postes cochés.
 */
export interface ProvisionalPrintPayload {
  readonly parts: readonly ProductionDossierPart[];
  readonly groups: "all" | readonly string[];
  readonly orders: ProvisionalPrintOrders;
}
