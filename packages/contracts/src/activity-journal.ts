import { z } from "zod";

/**
 * Contrat de lecture du **journal d'activité** — qui a fait quoi, tous modules
 * confondus.
 *
 * Le journal est alimenté par les handlers (append-only) ; il n'a donc aucun
 * payload d'écriture. Ce fichier ne décrit qu'une **question** et sa réponse.
 */

/** Le module d'où vient un fait — dérivé du préfixe de son `type`. */
/**
 * `equipe` — l'annuaire staff et ses rôles (2026-09-18). Un module à lui : sous
 * `comptes`, le filtre aurait mêlé l'équipe et les clients.
 *
 * `production` — la journée du fournil et le réglage de ses contenants
 * (2026-09-19). Ordre de déploiement libre : le back-office déjà servi lit la
 * réponse sans la parser (`http.get<T>`) et masque la pastille d'un module qu'il
 * ne connaît pas (`@if (line.moduleLabel)`), vérifié le 2026-09-19.
 */
export const activityModuleSchema = z.enum([
  "pim",
  "commercial",
  "commandes",
  "comptes",
  "equipe",
  "production",
]);
export type ActivityModule = z.infer<typeof activityModuleSchema>;

/**
 * Les filtres du journal. Tous facultatifs : sans aucun, on lit le flux entier,
 * du plus récent au plus ancien.
 *
 * Ce sont des **paramètres de requête**, donc des chaînes à l'arrivée : le
 * schéma les convertit, et c'est lui qui décide qu'une limite de 500 est un
 * refus plutôt qu'une page géante.
 */
const activityFiltersSchema = z.object({
  /** Module émetteur (`pim`, `commercial`…). */
  module: activityModuleSchema.optional(),
  /** Type exact (`tax_regime.rate_changed`) — le filtre le plus précis. */
  type: z.string().min(1).optional(),
  /** Ce dont on veut l'histoire : un régime, un produit, une société… */
  subjectType: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  /** Qui a agi — l'id de fiche staff (ou l'un de ses anciens `sub`) ou l'id client. */
  actorId: z.string().min(1).optional(),
  /** Bornes de temps, en ISO. `since` incluse, `until` exclue. */
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  /**
   * Recherche libre (2026-09-18) : un nom, un prénom, un morceau de numéro, un
   * identifiant. Retient le fait dont le nom figé de l'auteur OU la charge
   * utile contient le texte (casse ignorée), ou dont le sujet EST ce texte.
   * Les accents comptent : « cecile » ne trouve pas « Cécile ».
   *
   * Deux caractères au moins : un seul ramènerait presque tout le journal.
   */
  q: z.string().trim().min(2).max(100).optional(),
  /**
   * Pagination par curseur : l'`id` ULID de la dernière ligne rendue.
   *
   * Servi pour le front en ligne, qui le lit encore ; les pages numérotées
   * (`page`) sont l'autre façon de lire, et les deux ne se combinent pas.
   */
  before: z.string().min(1).optional(),
  /**
   * Pagination NUMÉROTÉE (2026-09-19), à partir de 1 — pour un paginateur qui
   * saute à la page 3 et annonce un total. `limit` en est la taille.
   */
  page: z.coerce.number().int().min(1).optional(),
  /**
   * L'**ancre** de l'instantané parcouru : l'`id` du fait le plus récent que la
   * première page a vu, rendu par elle dans `asOf`. Sans elle, un numéro de
   * page glisse d'un rang à chaque fait écrit pendant la lecture. Absente, la
   * réponse en fixe une.
   */
  asOf: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Refusé plutôt que départagé : une règle de priorité silencieuse ferait lire
 * une autre page que celle que l'écran croit demander.
 */
const PAGE_OR_CURSOR = {
  message: "`page` et `before` ne se combinent pas : lisez par numéro de page OU par curseur.",
  path: ["page"],
};

function pageOrCursor(query: {
  readonly page?: number | undefined;
  readonly before?: string | undefined;
}): boolean {
  return query.page === undefined || query.before === undefined;
}

export const activityQuerySchema = activityFiltersSchema.refine(pageOrCursor, PAGE_OR_CURSOR);
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

/**
 * Les filtres de la **tranche fiscale** (`GET /admin/activity/tax`, 2026-09-19) :
 * ceux du journal, **sans `module`**.
 *
 * La tranche est bornée au serveur par une liste fermée de types — taux de TVA,
 * TVA d'une famille ou d'une fiche, règles comptables. Un module n'y ajouterait
 * rien qu'une intersection vide ou redondante ; il est donc retiré du contrat
 * plutôt qu'accepté et ignoré. Un `module` envoyé quand même est écarté par le
 * schéma, comme tout paramètre inconnu : il ne peut pas élargir la tranche.
 */
export const taxActivityQuerySchema = activityFiltersSchema
  .omit({ module: true })
  .refine(pageOrCursor, PAGE_OR_CURSOR);
export type TaxActivityQuery = z.infer<typeof taxActivityQuerySchema>;

/** Un fait du journal, tel que l'écran le reçoit. */
export interface ActivityEventView {
  /** ULID — trie par le temps, et sert de curseur de pagination. */
  readonly id: string;
  readonly type: string;
  /** Déduit du préfixe du type ; `null` si le préfixe n'est pas rattaché. */
  readonly module: ActivityModule | null;
  readonly occurredAt: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly actorType: "customer" | "staff" | "system";
  readonly actorId: string | null;
  /**
   * Le nom **figé au moment de l'acte**, `null` quand l'annuaire ne connaissait
   * pas l'acteur. L'écran affiche alors sa nature (« un membre du staff »), il
   * n'invente pas un nom et n'affiche pas un identifiant technique.
   */
  readonly actorName: string | null;
  /** Sa **fonction** à ce moment-là (« Commercial »), `null` pour un client. */
  readonly actorRole: string | null;
  /** Corrélation : tous les faits d'une même requête partagent cette trace. */
  readonly traceId: string;
  /** Le « avant → après » du fait, et sa portée sous la clé `blast`. */
  readonly payload: Record<string, unknown>;
}

/**
 * Une page du flux. `nextBefore` est `null` quand on a atteint le fond.
 *
 * `total`, `page` et `asOf` sont venus le 2026-09-19, en AJOUT : le front en
 * ligne ne lit que `events` et `nextBefore`, qui ne changent pas.
 */
export interface ActivityPageView {
  readonly events: readonly ActivityEventView[];
  readonly nextBefore: string | null;
  /** Les faits de l'instantané qui répondent aux filtres — curseur exclu. */
  readonly total: number;
  /**
   * Le numéro de la page rendue. `null` quand elle a été lue par curseur
   * (`before`) : sa position n'est alors pas calculée, et un numéro inventé
   * mentirait au paginateur.
   */
  readonly page: number | null;
  /**
   * L'ancre de l'instantané lu, à renvoyer pour les pages suivantes. `null`
   * quand aucun fait ne répond aux filtres.
   */
  readonly asOf: string | null;
}
