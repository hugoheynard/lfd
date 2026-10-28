import { z } from "zod";

import type { CustomerOrderView, FulfillmentMethod, OrderSaleUnit, VatShareView } from "./order.js";

/** Un jour `AAAA-MM-JJ` ; l'existence au calendrier se vérifie au serveur. */
const orderDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "jour attendu au format AAAA-MM-JJ");

/**
 * **« Mes commandes » d'une société, sites compris** — `GET
 * /companies/:companyId/orders?site=…` (plan
 * `documentation/comptes-client/plan-commandes-des-sites.md`, lot C1,
 * 2026-10-21).
 *
 * `site` filtre sur UNE société : le principal lui-même ou l'un de ses sites
 * ACTUELS. Un id hors de ce périmètre rend une liste vide, jamais l'erreur qui
 * dirait qu'il existe.
 */
export const companyOrdersQuerySchema = z.object({
  site: z.string().min(1).optional(),
  /**
   * Bornes INCLUSES sur le jour de retrait/livraison (`requested_delivery_date`)
   * — plan `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, §6.6.
   * Une commande sans date sort de la liste dès qu'une borne est posée.
   */
  from: orderDaySchema.optional(),
  to: orderDaySchema.optional(),
});
export type CompanyOrdersQuery = z.infer<typeof companyOrdersQuerySchema>;

/** Le site d'une commande, quand ce n'est pas la société listée elle-même. */
export interface CompanyOrderSiteView {
  readonly companyId: string;
  /** Son enseigne (sa raison sociale à défaut), lue à la requête. */
  readonly name: string;
}

/**
 * Qui a passé la commande (§7.6) — un fait figé, `placed_by_user_id`, et non
 * une déduction sur des rattachements qui changent. `team` : saisie par
 * l'équipe.
 */
export type CompanyOrderAuthorView =
  { readonly kind: "team" } | { readonly kind: "customer"; readonly name: string };

/**
 * Une ligne de la liste : la commande telle que le client la voit, plus son
 * site et son auteur. ADDITIF sur `CustomerOrderView` : un écran qui ne lit
 * que la commande continue de fonctionner.
 */
export interface CompanyOrderListItemView extends CustomerOrderView {
  /** `null` : la commande est celle de la société listée. */
  readonly site: CompanyOrderSiteView | null;
  readonly author: CompanyOrderAuthorView;
}

/**
 * **Le plafond du récapitulatif** (§6.5) : au-delà, le serveur refuse en le
 * nommant, et l'écran le dit avant d'envoyer.
 */
export const ORDER_SUMMARY_MAX_ORDERS = 200;

/** Les formats du récapitulatif : à l'écran, imprimé, au tableur (§6.5). */
export const ORDER_SUMMARY_FORMATS = ["json", "pdf", "csv"] as const;
export type OrderSummaryFormat = (typeof ORDER_SUMMARY_FORMATS)[number];

/**
 * Le corps de `POST /companies/:companyId/orders/summary` — une LECTURE, en
 * `POST` parce que la sélection va dans le corps (§6.5). Le même
 * récapitulatif en `json` (R1), en PDF et en tableur CSV (R2, 2026-10-21).
 */
export const companyOrderSummaryRequestSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1),
  format: z.enum(ORDER_SUMMARY_FORMATS).default("json"),
  /**
   * Les bornes du filtre AFFICHÉ quand la sélection a été faite (lot R3,
   * §9) — purement informatives : le PDF et le tableur les impriment, elles
   * n'élargissent ni ne restreignent la sélection (les ids font foi). Mêmes
   * règles que le filtre de la liste.
   */
  period: z.object({ from: orderDaySchema.optional(), to: orderDaySchema.optional() }).optional(),
});
export type CompanyOrderSummaryRequest = z.infer<typeof companyOrderSummaryRequestSchema>;

/** Un produit du récapitulatif : un SKU, même vendu à deux prix (§6.1). */
export interface OrderSummaryProductView {
  readonly sku: string;
  /** Le nom figé de la commande la plus récente qui le porte. */
  readonly name: string;
  /** Des pièces, ou des GRAMMES si `saleUnit = weight` — sommés dans la même unité. */
  readonly quantity: number;
  /**
   * L'unité de la quantité (`plan-vente-au-poids.md`, P5). Un SKU n'a qu'une
   * unité — elle est figée à sa première publication —, si bien que ses
   * lignes se somment toujours dans la même.
   */
  readonly saleUnit: OrderSaleUnit;
  /** Somme des `line_total_cents` — hors taxe, en centimes. */
  readonly htCents: number;
}

/**
 * Le bas d'une table, comme une facture (§6.1) : chaque montant est la SOMME
 * de la colonne des commandes, en centimes — jamais un recalcul.
 */
export interface OrderSummaryBottomView {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  /** La TVA par taux, somme des `vat_shares`, taux croissants. */
  readonly vat: readonly VatShareView[];
  /**
   * La TVA des commandes qui n'ont pas de ventilation par taux
   * (`vat_shares` nul) — sommée telle quelle, sans taux inventé.
   */
  readonly unventilatedVatCents: number;
  /** Somme des `total_cents` — le TTC à la commande. */
  readonly totalCents: number;
}

/**
 * **Un bon de commande inclus** (plan §10, Hugo 2026-10-21 : « il me faudrait
 * les bons de commande associés ») — une commande COMPTÉE, telle que son bon
 * l'imprime. Aucune TVA ni TTC : un bon de pro est en HT (F5).
 */
export interface OrderSummaryOrderView {
  readonly orderId: string;
  readonly orderNumber: string;
  /** Le jour de retrait/livraison `AAAA-MM-JJ` ; `null` : sans date. */
  readonly day: string | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  /** Qui l'a passée — même fait que la liste (C1, §7.6). */
  readonly author: CompanyOrderAuthorView;
  /**
   * Le « Total HT » du bon (`order-sheet-pdf-totals.ts`, F5) : articles moins
   * remise et bon de fidélité (plancher à zéro), plus livraison et surtaxe.
   */
  readonly pretaxCents: number;
}

/**
 * La somme des HT des bons d'une table, rapprochée de son sous-total HT : les
 * deux diffèrent des gestes du bas (remises, bons, livraison, surtaxes) — la
 * différence est servie pour être EXPLIQUÉE, jamais laissée muette.
 */
export interface OrderSummaryOrdersPretaxView {
  /** Somme des `pretaxCents` des bons. */
  readonly pretaxCents: number;
  /** `pretaxCents − subtotalCents`, signé. */
  readonly gapCents: number;
  /**
   * La part de l'écart qui ne vient PAS des gestes du bas : une remise
   * plafonnée au montant des articles (le bon ne descend pas sous zéro).
   */
  readonly cappedDiscountCents: number;
}

/** Une table : les produits et le bas d'un ensemble de commandes. */
export interface OrderSummaryTableView {
  readonly orderCount: number;
  readonly products: readonly OrderSummaryProductView[];
  readonly bottom: OrderSummaryBottomView;
  /** Le rapprochement des bons inclus avec le sous-total HT (§10). */
  readonly ordersPretax: OrderSummaryOrdersPretaxView;
}

/** La table d'une société : le principal, ou l'un de ses sites (§6.2). */
export interface OrderSummaryCompanyView extends OrderSummaryTableView {
  readonly companyId: string;
  readonly name: string;
  /** Ses bons comptés, par jour croissant (sans date en dernier), puis référence. */
  readonly orders: readonly OrderSummaryOrderView[];
}

export const ORDER_SUMMARY_EXCLUSION_REASONS = [
  "cancelled",
  "payment_pending",
  "payment_failed",
] as const;
export type OrderSummaryExclusionReason = (typeof ORDER_SUMMARY_EXCLUSION_REASONS)[number];

/** Une commande sélectionnée mais laissée hors des totaux, et pourquoi. */
export interface OrderSummaryExcludedView {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly reason: OrderSummaryExclusionReason;
}

/**
 * Le récapitulatif de commandes sélectionnées (§6). `amountsAt: "placement"`
 * : les montants sont ceux de la commande — remboursements et avoirs
 * postérieurs non déduits ; le relevé comptable, ce sont les factures (§6.4).
 */
export interface CompanyOrderSummaryView {
  readonly amountsAt: "placement";
  /** La société listée d'abord, puis chaque site par nom. */
  readonly companies: readonly OrderSummaryCompanyView[];
  /** Le total général, par produit et par ligne du bas. */
  readonly total: OrderSummaryTableView;
  readonly excluded: readonly OrderSummaryExcludedView[];
}
