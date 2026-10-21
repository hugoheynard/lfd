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

/**
 * `placed` tant que rien ne l'a annulé. Un brouillon — la demande en cours —
 * n'a pas de statut ici : il est servi à part (`SiteResupplyDraftView`).
 */
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
 * **La demande en cours** d'un point pour une visée (lot R1c, 2026-10-21) :
 * le brouillon enregistré, que tous les postes du comptoir remplissent. Une
 * seule par (point, visée, journée). `version` se renvoie avec chaque
 * correction, retrait et envoi : un poste qui n'a plus la dernière version
 * sous les yeux est refusé (409) plutôt que d'écraser l'autre.
 */
export interface SiteResupplyDraftView {
  readonly id: string;
  readonly target: ResupplyTarget;
  /** `AAAA-MM-JJ`. Une demande « pour demain » restée sans envoi garde sa journée. */
  readonly serviceDay: string;
  readonly version: number;
  /** Dans l'ordre de premier ajout ; peut être vide (tout a été retiré). */
  readonly lines: readonly SiteResupplyLineView[];
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
  /**
   * Les demandes en cours du point pour aujourd'hui et demain. Une demande
   * dont la journée est passée n'y figure plus : elle ne s'envoie plus.
   */
  readonly drafts: readonly SiteResupplyDraftView[];
  /** Les réassorts envoyés, les plus récents d'abord. */
  readonly resupplies: readonly SiteResupplyView[];
}

/**
 * `POST /admin/site-resupplies/sites/:siteId` — passer un réassort d'un
 * geste. Depuis R1c, les lignes s'AJOUTENT à la demande en cours de la visée
 * (une quantité s'additionne à celle d'un article déjà présent), puis la
 * demande entière est envoyée. Le libellé n'est PAS accepté : le serveur le
 * lit au catalogue publié. Les règles (quantité entière > 0, au moins une
 * ligne) vivent dans le domaine.
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

/**
 * `POST /admin/site-resupplies/sites/:siteId/drafts/:target/lines` — ajoute
 * un article à la demande en cours de la visée, ouverte au besoin. Un
 * article déjà présent voit sa quantité s'additionner. Sans version : deux
 * ajouts ne s'écrasent jamais, ils se cumulent.
 */
export const addSiteResupplyLineSchema = z
  .object({ sku: z.string().trim().min(1), quantity: z.number() })
  .strict();
export type AddSiteResupplyLinePayload = z.infer<typeof addSiteResupplyLineSchema>;

/** La version de la demande que le poste a sous les yeux. */
const seenVersion = z.number().int().min(1);

/** `PATCH …/sites/:siteId/:resupplyId/lines/:sku` — corriger une quantité. */
export const correctSiteResupplyLineSchema = z
  .object({ quantity: z.number(), version: seenVersion })
  .strict();
export type CorrectSiteResupplyLinePayload = z.infer<typeof correctSiteResupplyLineSchema>;

/**
 * `POST …/sites/:siteId/:resupplyId/lines/:sku/withdraw` — retirer une ligne ;
 * `POST …/sites/:siteId/:resupplyId/send` — envoyer la demande au fournil.
 */
export const seenSiteResupplyVersionSchema = z.object({ version: seenVersion }).strict();
export type SeenSiteResupplyVersionPayload = z.infer<typeof seenSiteResupplyVersionSchema>;

/** Réponse de la passation ou d'un ajout : l'identifiant ; l'écran relit la liste. */
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
