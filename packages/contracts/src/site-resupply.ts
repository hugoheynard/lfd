import { z } from "zod";

import type { ResupplyArticleView } from "./resupply-receipt.js";

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
 * Qui envoie un réassort (lot R1d, 2026-10-21) : `counter` — le comptoir, par
 * sa demande en cours ; `bakehouse` — le fournil, « je t'envoie ça », un
 * réassort à part, créé déjà envoyé, qui ne touche jamais la demande du
 * comptoir.
 */
export const RESUPPLY_ORIGINS = ["counter", "bakehouse"] as const;
export type ResupplyOrigin = (typeof RESUPPLY_ORIGINS)[number];

/**
 * Le nom d'un réassort tient en 60 caractères au plus (lot R1g, Hugo
 * 2026-10-21 : « vitrine du matin »). Libre et facultatif : rogné par le
 * serveur, vide vaut « sans nom ».
 */
export const RESUPPLY_NAME_MAX = 60;

/**
 * Le titre d'un réassort nommé, partout où il se lit (R1g) : « Vitrine du
 * matin — Village ». Sans nom, `unnamed` — l'affichage de l'endroit, tel
 * qu'avant le nom (« Réassort Village »…).
 */
export function resupplyTitleOf(name: string | null, siteLabel: string, unnamed: string): string {
  return name === null ? unnamed : `${name} — ${siteLabel}`;
}

/** Combien de noms déjà employés au point la saisie propose, au plus. */
export const RESUPPLY_USED_NAMES_MAX = 20;

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
  /** Qui l'a envoyé : le comptoir, ou le fournil (R1d). */
  readonly origin: ResupplyOrigin;
  /** Son nom libre (R1g), « Vitrine du matin » ; `null` : sans nom. */
  readonly name: string | null;
  readonly status: SiteResupplyStatus;
  /** Dans l'ordre de saisie. */
  readonly lines: readonly SiteResupplyLineView[];
  readonly placedAt: string;
  /** Nom figé de qui l'a passé ; `null` si l'annuaire ne le connaissait pas. */
  readonly placedBy: string | null;
  readonly cancelledAt: string | null;
  readonly cancelledBy: string | null;
  /**
   * « Il est là » (lot R3e) : la réception du transfert qui le porte, ou
   * « Monté » au fournil ; `null` tant qu'il est attendu.
   */
  readonly arrivedAt: string | null;
  /** Nom figé de qui l'a dit arrivé ; `null` s'il est attendu ou inconnu. */
  readonly arrivedBy: string | null;
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
  /** Le nom posé sur la demande (R1g) ; `null` : sans nom. */
  readonly name: string | null;
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
  /**
   * Les noms déjà employés au point (R1g), distincts, les plus récents
   * d'abord, {@link RESUPPLY_USED_NAMES_MAX} au plus : proposés à la saisie.
   */
  readonly usedNames: readonly string[];
}

/**
 * `GET /admin/bakehouse-resupplies/sites/:siteId/names` — les noms déjà
 * employés au point, pour la carte « Envoyer un réassort » du fournil (R1g).
 */
export interface ResupplyUsedNamesView {
  readonly names: readonly string[];
}

/**
 * `PUT /admin/site-resupplies/sites/:siteId/drafts/:target/name` — nomme la
 * demande en cours de la visée, ouverte au besoin (R1g). `null` ou vide :
 * retire le nom. Sans version : le dernier nom posé l'emporte. La borne de
 * longueur vit dans le domaine.
 */
export const nameSiteResupplySchema = z.object({ name: z.string().nullable() }).strict();
export type NameSiteResupplyPayload = z.infer<typeof nameSiteResupplySchema>;

/**
 * `POST /admin/bakehouse-resupplies/sites/:siteId` — le fournil envoie un
 * réassort au point, d'un geste (lot R1d). Un réassort À PART : il ne touche
 * pas la demande en cours du comptoir. Un article présent deux fois voit ses
 * quantités s'additionner. Le libellé n'est PAS accepté : le serveur le lit
 * au catalogue publié. Les règles (quantité entière > 0, au moins une ligne,
 * heure limite pour demain si le réassort y est soumis) vivent dans le
 * domaine.
 *
 * Jusqu'au 2026-10-21, le même corps passait par `POST
 * /admin/site-resupplies/sites/:siteId`, qui envoyait la demande « au plus
 * tôt » DU COMPTOIR : retiré au lot R1d.
 */
export const placeSiteResupplySchema = z
  .object({
    target: z.enum(RESUPPLY_TARGETS),
    /** Son nom (R1g) ; absent, `null` ou vide : sans nom. */
    name: z.string().nullable().optional(),
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

/**
 * `GET /admin/site-resupplies/to-produce/:day` — l'onglet « Réassorts » de
 * Prod manager (lot R3d, `reassort-boutiques/plan-reapprovisionnement.md`,
 * Hugo 2026-10-21) : UNE journée, et ses réassorts pour demain MÊME figés.
 *
 * Là où `ResuppliesToProduceView` tait les réassorts figés (ils sont sur la
 * feuille du fournil, R3a), celle-ci les montre et dit pourquoi ils ne
 * bougent plus : `planStopped`.
 */
export interface ResupplyProductionDayView extends ResupplyDayToProduceView {
  /**
   * Le plan du fournil pour cette journée est arrêté : ses réassorts « pour
   * demain » y sont figés (ni ajout, ni annulation). Les « au plus tôt » ne
   * le sont jamais.
   */
  readonly planStopped: boolean;
  /** Le catalogue publié de la boutique, sans prix : les lignes de la table et leurs familles. */
  readonly articles: readonly ResupplyArticleView[];
  /**
   * Les points de la journée servis par transfert (lot R3e) : leurs réassorts
   * arrivent à la réception du transfert. Aux autres (servis sur place), le
   * fournil dit « Monté ».
   */
  readonly transferSiteIds: readonly string[];
}
