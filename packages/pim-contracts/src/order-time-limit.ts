import { z } from "zod";

/**
 * **La limite de commande**, déclarée par le référentiel.
 *
 * Elle répond à « jusqu'à quand accepte-t-on une commande pour un
 * acheminement le jour J ? », et rien d'autre : ni où l'on retire, ni comment
 * on livre.
 *
 * ## Les portées
 *
 * Le référentiel pose une limite sur un **produit** ou sur une **famille**
 * (décisions de Hugo du 2026-10-21 et du 2026-11-23). « Toute la production »
 * se règle au commerce, et une déclinaison suit son produit : `global` et
 * `variant` restent dans l'énumération pour relire les lignes résiduelles,
 * jamais pour en poser.
 *
 * Une limite est une **règle entière** — délai ET heure, sans rattrapage. Une
 * limite de famille vise toute sa descendance, sauf les produits qu'elle
 * exclut nommément. Quand plusieurs limites visent un article (son produit,
 * ses familles), **la plus stricte gagne** ; la résolution vit dans
 * `@lfd/catalog-sync`, partagée par les deux rives.
 */

/** Les portées, du plus général au plus précis. Mêmes valeurs que `PriceScopeType`. */
export const ORDER_TIME_LIMIT_SCOPES = ["global", "category", "product", "variant"] as const;
export const orderTimeLimitScopeTypeSchema = z.enum(ORDER_TIME_LIMIT_SCOPES);
export type OrderTimeLimitScopeType = (typeof ORDER_TIME_LIMIT_SCOPES)[number];

export const ORDER_TIME_LIMIT_SCOPE_LABELS: Readonly<Record<OrderTimeLimitScopeType, string>> = {
  global: "Toute la production",
  category: "Famille",
  product: "Produit",
  variant: "Déclinaison",
};

/** `HH:MM` en 24 h — l'heure de pendule d'Europe/Paris, jamais un instant UTC. */
export const orderLimitTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "heure attendue au format HH:MM");

/**
 * La portée visée. `id` est `null` **si et seulement si** `type === 'global'` :
 * une portée « famille » sans famille ne vise rien, et une portée « toute la
 * production » qui nomme une famille dit deux choses contradictoires. Le serveur
 * refuse dans les deux sens.
 */
export const orderTimeLimitScopeSchema = z.object({
  type: orderTimeLimitScopeTypeSchema,
  id: z.string().trim().min(1).nullable(),
});
export type OrderTimeLimitScope = z.infer<typeof orderTimeLimitScopeSchema>;

/**
 * Ce qu'on pose sur une portée. La forme admet `null` ; le serveur refuse une
 * limite sans délai ou sans heure, et un rattrapage non nul.
 */
export const orderTimeLimitPayloadSchema = z.object({
  scope: orderTimeLimitScopeSchema,
  /** Combien de jours **avant** l'acheminement la limite tombe. `0` = le jour même. */
  daysBefore: z.number().int().min(0).max(14).nullable().default(null),
  /** L'heure de la limite, ce jour-là. */
  time: orderLimitTimeSchema.nullable().default(null),
  /**
   * Le rattrapage accordé après la limite, en minutes. Plafonné à 12 h : au-delà
   * ce n'est plus un rattrapage, c'est une autre limite, et elle doit se saisir
   * comme telle pour rester lisible.
   */
  graceMinutes: z.number().int().min(0).max(720).nullable().default(null),
  /**
   * L'équipe peut-elle passer outre cette limite en saisissant une commande
   * pour un client ? **Obligatoire**, sans défaut : un écran qui ne l'envoie
   * pas décocherait la case en silence à chaque pose d'heure.
   */
  staffMayExceed: z.boolean(),
});
export type OrderTimeLimitPayload = z.infer<typeof orderTimeLimitPayloadSchema>;

/** Une règle telle qu'elle est relue. */
export interface OrderTimeLimitView {
  readonly id: string;
  readonly scope: OrderTimeLimitScope;
  /** Le nom de la famille / du produit visé, résolu pour l'affichage. */
  readonly scopeLabel: string | null;
  readonly daysBefore: number | null;
  readonly time: string | null;
  readonly graceMinutes: number | null;
  /** L'équipe peut passer outre cette limite (avec le droit, en saisie). */
  readonly staffMayExceed: boolean;
  /**
   * Archivée : la limite **ne s'applique plus** — ni au référentiel, ni au
   * commerce. Elle reste listée pour pouvoir être restaurée.
   */
  readonly archived: boolean;
  /**
   * Les produits exclus **en vigueur** d'une limite de famille ; toujours vide
   * pour une limite de produit.
   */
  readonly excludedProductIds: readonly string[];
}

/**
 * Le résultat de l'héritage : une règle **complète**, ou `null` quand aucun rang
 * n'a posé de quoi en faire une.
 *
 * `graceMinutes` n'a pas de `null` ici : un rattrapage non déclaré vaut `0`,
 * c'est-à-dire « la limite est ferme ». `daysBefore` et `time`, eux, n'ont pas
 * de valeur par défaut raisonnable — inventer « la veille à 18 h » ferait
 * refuser des commandes au nom d'une règle que personne n'a écrite.
 */
export interface ResolvedOrderTimeLimit {
  readonly daysBefore: number;
  readonly time: string;
  readonly graceMinutes: number;
}

/**
 * Ce que rend la pose d'une limite.
 *
 * Déclaré ICI et pas dans le front : une forme de réponse redéclarée côté client
 * en devient une **copie**, et une copie ne suit pas — le serveur change, le
 * front compile toujours, et l'écran affiche `undefined`.
 */
export interface SetOrderTimeLimitResponse {
  readonly id: string;
}

/**
 * **La règle générale du commerce**, montrée en lecture en tête de la page des
 * limites de commande (`GET /pim/order-time-limits/general-cutoff`).
 *
 * Depuis le 2026-10-21 (décision de Hugo), « toute la production » ne se règle
 * plus au référentiel mais dans Réglages › Commandes › Heure limite. `rule`
 * vaut `null` quand le commerce n'en a aucune. Elle est toujours en vigueur :
 * l'interrupteur qui la coupait (`enabled`) est retiré le 2026-10-21
 * (`limites-de-commande/plan-une-seule-heure.md` §5).
 */
export interface GeneralOrderCutoffView {
  readonly rule: {
    readonly daysBefore: number;
    readonly time: string;
    readonly graceMinutes: number;
  } | null;
}
