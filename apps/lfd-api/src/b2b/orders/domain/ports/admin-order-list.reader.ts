import type {
  AdminOrderRow,
  FulfillmentMethod,
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "@lfd/contracts";

import type { AdminOrderCursor } from "../value-objects/admin-order-cursor.js";

/**
 * Ce que la liste staff retient — déjà traduit : les jours de passation sont
 * des INSTANTS (minuit de Paris), les jours de retrait des jours, la recherche
 * des mots. `null` = pas de filtre.
 */
export interface AdminOrderListCriteria {
  readonly companyId: string | null;
  readonly withSubAccounts: boolean;
  readonly status: OrderStatus | null;
  readonly paymentStatus: PaymentStatus | null;
  /** Les commandes d'avant la distinction (`clientele` nul) ne répondent à aucune valeur. */
  readonly clientele: OrderClientele | null;
  readonly method: FulfillmentMethod | null;
  /** Passée à partir de cet instant, inclus. */
  readonly placedFrom: Date | null;
  /** Passée avant cet instant, exclu. */
  readonly placedBefore: Date | null;
  /** Jour de retrait ou de livraison `AAAA-MM-JJ`, bornes incluses. */
  readonly fulfillmentFrom: string | null;
  readonly fulfillmentTo: string | null;
  /** Chaque mot doit se trouver dans l'un des champs cherchés. Vide = pas de recherche. */
  readonly searchTerms: readonly string[];
  /** Reprendre strictement après cette ligne ; `null` = première page. */
  readonly after: AdminOrderCursor | null;
  /** Lignes sautées avant la page — `(page - 1) × limit` ; 0 avec un curseur. */
  readonly skip: number;
  readonly limit: number;
}

/**
 * Une page lue : au plus `limit` lignes, s'il en reste au-delà, et combien de
 * commandes répondent aux filtres (curseur et saut exclus).
 */
export interface AdminOrderListSlice {
  readonly rows: readonly AdminOrderRow[];
  readonly hasMore: boolean;
  readonly total: number;
}

/**
 * Port de **lecture** de la liste staff des commandes, ordonnée
 * `createdAt desc, id desc`.
 *
 * Séparé d'`OrderReader` le 2026-10-12 (page-commandes, C1) : la liste a
 * ses propres filtres et sa pagination, et aucun autre consommateur d'`OrderReader`
 * n'en a besoin. Aucun mur ici — la porte staff du contrôleur décide, et le
 * staff voit les commandes des sociétés comme celles des particuliers.
 */
export abstract class AdminOrderListReader {
  abstract page(criteria: AdminOrderListCriteria): Promise<AdminOrderListSlice>;
}
