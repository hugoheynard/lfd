import { z } from "zod";

/**
 * ── Les rapports du SUR MESURE (lot R) ──────────────────────────────────────
 *
 * `documentation/catalogue/plan-sur-mesure-partout.md`, § 5 ter : deux
 * rapports, lus sur les lignes de commande qui scellent le marqueur
 * (`order_lines.made_to_order`).
 *
 * - `GET /admin/growth/made-to-order/monthly?months=6|12|24` → `MadeToOrderMonthlyView`
 * - `GET /admin/growth/made-to-order/clients?from=&to=` → `MadeToOrderByClientView`
 *
 * Sous `b2b_growth:read`. Montants en centimes, **HT des lignes avant remise
 * de commande** — pas de TTC (la ligne d'un pro n'en porte pas). Une ligne
 * d'avant le suivi (`NULL`) n'est jamais comptée comme non sur mesure : elle
 * a son propre montant (`unknown…`).
 */

/** Les fenêtres du rapport mensuel, en mois glissants, mois courant compris. */
export const MADE_TO_ORDER_MONTH_WINDOWS = [6, 12, 24] as const;
export type MadeToOrderMonthWindow = (typeof MADE_TO_ORDER_MONTH_WINDOWS)[number];
export const DEFAULT_MADE_TO_ORDER_MONTH_WINDOW: MadeToOrderMonthWindow = 12;

/** La plus longue période du rapport par client, en jours. */
export const MADE_TO_ORDER_MAX_PERIOD_DAYS = 366;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ");

export const madeToOrderMonthlyQuerySchema = z.strictObject({
  months: z.coerce
    .number()
    .pipe(z.literal(MADE_TO_ORDER_MONTH_WINDOWS, "fenêtre attendue : 6, 12 ou 24 mois"))
    .optional(),
});
export type MadeToOrderMonthlyQuery = z.infer<typeof madeToOrderMonthlyQuerySchema>;

export const madeToOrderByClientQuerySchema = z.strictObject({
  from: isoDay,
  to: isoDay,
});
export type MadeToOrderByClientQuery = z.infer<typeof madeToOrderByClientQuerySchema>;

/** Un mois de passation (Paris), ses lignes HT réparties par état du marqueur. */
export interface MadeToOrderMonth {
  /** `AAAA-MM`. */
  readonly month: string;
  readonly madeToOrderHtCents: number;
  readonly otherHtCents: number;
  /** Lignes d'avant le suivi : ni l'un ni l'autre. */
  readonly unknownHtCents: number;
  /** Les trois ensemble : le CA HT des lignes du mois. */
  readonly totalHtCents: number;
  /** Commandes portant au moins une ligne sur mesure. */
  readonly madeToOrderOrders: number;
  /** `madeToOrderHtCents / totalHtCents`, entre 0 et 1 ; `null` sur un mois sans ligne. */
  readonly madeToOrderShare: number | null;
}

export interface MadeToOrderMonthlyView {
  readonly months: MadeToOrderMonthWindow;
  /** Du plus ancien au mois courant. */
  readonly rows: readonly MadeToOrderMonth[];
}

/** Un article sur mesure d'un client sur la période. */
export interface MadeToOrderClientArticle {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: "piece" | "weight";
  /** Des pièces, ou des grammes si `saleUnit = weight`. */
  readonly quantity: number;
  readonly htCents: number;
  readonly orders: number;
}

export interface MadeToOrderClient {
  /** `company:<id>` ou `person:<id>` — une clé de ligne, pas une adresse. */
  readonly clientKey: string;
  readonly kind: "company" | "person";
  /** L'identifiant de la société, pour ouvrir sa fiche ; `null` pour un particulier. */
  readonly companyId: string | null;
  readonly name: string;
  /** Le principal figé à la passation ; `null` sans principal ou avant la colonne. */
  readonly principalName: string | null;
  readonly madeToOrderHtCents: number;
  readonly articles: readonly MadeToOrderClientArticle[];
  /** HT des lignes d'avant le suivi sur la période. */
  readonly unknownHtCents: number;
}

export interface MadeToOrderByClientView {
  readonly from: string;
  readonly to: string;
  readonly madeToOrderHtCents: number;
  readonly unknownHtCents: number;
  /** Par HT sur mesure décroissant, puis d'avant le suivi, puis par nom. */
  readonly clients: readonly MadeToOrderClient[];
}
