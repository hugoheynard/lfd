import { z } from "zod";

/**
 * Contrat de lecture du **journal d'activité** — qui a fait quoi, tous modules
 * confondus.
 *
 * Le journal est alimenté par les handlers (append-only) ; il n'a donc aucun
 * payload d'écriture. Ce fichier ne décrit qu'une **question** et sa réponse.
 */

/** Le module d'où vient un fait — dérivé du préfixe de son `type`. */
export const activityModuleSchema = z.enum(["pim", "commercial", "commandes", "comptes"]);
export type ActivityModule = z.infer<typeof activityModuleSchema>;

/**
 * Les filtres du journal. Tous facultatifs : sans aucun, on lit le flux entier,
 * du plus récent au plus ancien.
 *
 * Ce sont des **paramètres de requête**, donc des chaînes à l'arrivée : le
 * schéma les convertit, et c'est lui qui décide qu'une limite de 500 est un
 * refus plutôt qu'une page géante.
 */
export const activityQuerySchema = z.object({
  /** Module émetteur (`pim`, `commercial`…). */
  module: activityModuleSchema.optional(),
  /** Type exact (`tax_regime.rate_changed`) — le filtre le plus précis. */
  type: z.string().min(1).optional(),
  /** Ce dont on veut l'histoire : un régime, un produit, une société… */
  subjectType: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  /** Qui a agi — le `sub` staff ou l'id client. */
  actorId: z.string().min(1).optional(),
  /** Bornes de temps, en ISO. `since` incluse, `until` exclue. */
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  /** Pagination par curseur : l'`id` ULID de la dernière ligne rendue. */
  before: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

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
  /** Corrélation : tous les faits d'une même requête partagent cette trace. */
  readonly traceId: string;
  /** Le « avant → après » du fait, et sa portée sous la clé `blast`. */
  readonly payload: Record<string, unknown>;
}

/** Une page du flux. `nextBefore` est `null` quand on a atteint le fond. */
export interface ActivityPageView {
  readonly events: readonly ActivityEventView[];
  readonly nextBefore: string | null;
}
