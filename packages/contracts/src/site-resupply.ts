import { z } from "zod";

/**
 * **Commander un réassort** — la demande d'un point de retrait au fournil
 * (lot R1 de `documentation/reassort-boutiques/plan-reapprovisionnement.md`,
 * §12, Hugo 2026-10-21). Jamais une commande : aucun prix, aucune TVA, aucun
 * règlement. Ce qui arrive en vitrine est un autre agrégat, la réception
 * (`resupply-receipt.ts`).
 */

/**
 * La visée d'un réassort : `tomorrow` — la commande du soir pour le
 * lendemain, soumise à l'heure limite générale si le réglage le dit ;
 * `asap` — « au plus tôt », pour aujourd'hui, sans heure limite.
 */
export const RESUPPLY_TARGETS = ["tomorrow", "asap"] as const;
export type ResupplyTarget = (typeof RESUPPLY_TARGETS)[number];

/** `placed` tant que rien ne l'a annulé ; un brouillon ne quitte pas l'écran. */
export type SiteResupplyStatus = "placed" | "cancelled";

/** Une ligne demandée : SKU produit, nom publié figé au geste, quantité > 0. */
export interface SiteResupplyLineView {
  readonly sku: string;
  readonly label: string;
  readonly quantity: number;
}

export interface SiteResupplyView {
  readonly id: string;
  readonly siteId: string;
  /** `AAAA-MM-JJ` : demain pour `tomorrow`, le jour du geste pour `asap`. */
  readonly serviceDay: string;
  readonly target: ResupplyTarget;
  readonly status: SiteResupplyStatus;
  /** Dans l'ordre de saisie. */
  readonly lines: readonly SiteResupplyLineView[];
  readonly placedAt: string;
  /** Nom figé de qui l'a passé ; `null` si l'annuaire ne le connaissait pas. */
  readonly placedBy: string | null;
  readonly cancelledAt: string | null;
  readonly cancelledBy: string | null;
}

/**
 * `GET /admin/site-resupplies/sites/:siteId` — les réassorts du point pour
 * aujourd'hui et demain, journées calculées par l'horloge du serveur.
 */
export interface SiteResuppliesView {
  readonly siteId: string;
  /** `AAAA-MM-JJ`, heure de Paris. */
  readonly today: string;
  readonly tomorrow: string;
  /**
   * Jusqu'à quand « Pour demain » est accepté (ISO 8601), ou `null` : aucune
   * heure limite posée, ou réassort réglé « sans limite ».
   */
  readonly tomorrowOrderUntil: string | null;
  /** Les plus récents d'abord. */
  readonly resupplies: readonly SiteResupplyView[];
}

/**
 * `POST /admin/site-resupplies/sites/:siteId` — passer un réassort. Le
 * libellé n'est PAS accepté : le serveur le lit au catalogue publié. Les
 * règles (quantité entière > 0, un article une fois, au moins une ligne)
 * vivent dans le domaine.
 */
export const placeSiteResupplySchema = z
  .object({
    target: z.enum(RESUPPLY_TARGETS),
    lines: z
      .array(z.object({ sku: z.string().trim().min(1), quantity: z.number() }).strict())
      .max(200),
  })
  .strict();
export type PlaceSiteResupplyPayload = z.infer<typeof placeSiteResupplySchema>;

/** Réponse de la passation : l'identifiant ; l'écran relit la liste. */
export interface PlacedSiteResupplyResponse {
  readonly id: string;
}

/** Un article à produire pour une journée, tous points confondus. */
export interface ResupplyTotalView {
  readonly sku: string;
  readonly label: string;
  readonly quantity: number;
}

/** Ce qu'un point a demandé pour une journée : ses réassorts placés. */
export interface ResupplySiteToProduceView {
  readonly siteId: string;
  /** Nom du point ; `null` s'il a disparu de l'annuaire des sites. */
  readonly siteLabel: string | null;
  readonly resupplies: readonly SiteResupplyView[];
}

export interface ResupplyDayToProduceView {
  /**
   * `AAAA-MM-JJ`. Aujourd'hui porte les « au plus tôt » du jour ET la
   * commande d'hier soir pour aujourd'hui : chaque réassort dit sa visée.
   */
  readonly serviceDay: string;
  readonly sites: readonly ResupplySiteToProduceView[];
  /** Le cumul par article de la journée, dans l'ordre de première demande. */
  readonly totals: readonly ResupplyTotalView[];
}

/**
 * `GET /admin/site-resupplies/to-produce` — l'écran du fournil, EN LECTURE :
 * les réassorts placés d'aujourd'hui (« au plus tôt ») puis de demain.
 * Distinct des commandes client.
 */
export interface ResuppliesToProduceView {
  readonly days: readonly ResupplyDayToProduceView[];
}
