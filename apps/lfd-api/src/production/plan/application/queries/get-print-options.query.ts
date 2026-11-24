import type { ProductionGrouping } from "@lfd/contracts";

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
}

/**
 * **L'état de la fenêtre d'impression du dossier** (plan
 * `documentation/fournil/plan-impression-provisoire.md`, § 4).
 *
 * - `arrested` : le plan est arrêté — la fenêtre imprime des parties du
 *   dossier figé ; sinon, elle tire une impression provisoire ;
 * - `grouping` et `groups` : rayons (`shelf`) ou postes (`workstation`) du
 *   jour, dans l'ordre du dossier ;
 * - `orders` : celles du dossier figé, ou celles que l'arrêt figerait ;
 * - `prints` : les impressions provisoires du jour, par numéro croissant ;
 * - `changedSinceLast` : les commandes ont bougé au commerce depuis la
 *   dernière impression provisoire — toujours `false` sans impression, ou une
 *   fois le plan arrêté.
 */
export interface ProductionPrintOptionsView {
  readonly arrested: boolean;
  readonly grouping: ProductionGrouping;
  readonly groups: readonly string[];
  readonly orders: readonly PrintOptionOrder[];
  readonly prints: readonly PrintOptionRun[];
  readonly changedSinceLast: boolean;
}

/** L'état de la fenêtre d'impression du dossier d'une journée. */
export class GetPrintOptionsQuery {
  constructor(readonly serviceDay: string) {}
}
