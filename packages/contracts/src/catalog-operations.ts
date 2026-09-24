import { z } from "zod";

/**
 * ── Les opérations reçues, et leur surcharge à la réception ─────────────────
 *
 * Le référentiel prépare Noël, Pâques, la galette ; la plateforme les REÇOIT
 * par le fil v11 et peut les **restreindre** à la réception, jamais les étendre
 * (D9 de `documentation/order/architecture-operations-datees.md`).
 *
 * Routes (surface `b2b_catalog`, le droit du paramétrage du catalogue) :
 *
 * - `GET  /admin/catalog/operations` → `ReceivedOperationView[]`
 * - `PUT  /admin/catalog/operations/:key/override` ← `SetOperationOverridePayload` → `204`
 */

/** Les trois clientèles d'une opération (D7). */
export const RECEIVED_OPERATION_AUDIENCES = ["pro", "public", "both"] as const;
export type ReceivedOperationAudience = (typeof RECEIVED_OPERATION_AUDIENCES)[number];

/**
 * Poser la surcharge d'une opération reçue — l'état ENTIER, comme l'écran
 * l'affiche. `null` = on garde ce que le référentiel a dit.
 *
 * ⚠️ La surcharge ne se vérifie PAS contre le référentiel : une clôture posée
 * plus tard que la sienne est acceptée, et n'a simplement aucun effet — c'est
 * le plus tôt des deux qui ferme. Idem pour la clientèle, appliquée en
 * intersection. Seule la forme se refuse.
 */
export const setOperationOverridePayloadSchema = z.strictObject({
  /** Ne pas tenir l'opération du tout. */
  isHidden: z.boolean(),
  /** Fermer la commande plus tôt — un instant avec son fuseau. */
  orderUntil: z.iso.datetime({ offset: true }).nullable(),
  /** Restreindre la clientèle. */
  audience: z.enum(RECEIVED_OPERATION_AUDIENCES).nullable(),
  /** Les SKU retirés de la sélection, ici seulement. */
  hiddenSkus: z.array(z.string().min(1)),
});
export type SetOperationOverridePayload = z.infer<typeof setOperationOverridePayloadSchema>;

/** Un texte d'annonce dans ses langues — le français toujours. */
export interface ReceivedOperationText {
  readonly fr: string;
  readonly en?: string;
  readonly it?: string;
}

/** Ce que la réception a décidé, et qui. */
export interface OperationOverrideView {
  readonly isHidden: boolean;
  readonly orderUntil: string | null;
  readonly audience: ReceivedOperationAudience | null;
  readonly hiddenSkus: readonly string[];
  /** Un `StaffUser.id`, ou `null` hors requête. */
  readonly decidedBy: string | null;
  readonly decidedAt: string;
}

/**
 * Ce que la boutique appliquera — le référentiel combiné à la surcharge.
 * `audience: "none"` = la clientèle restreinte ne recouvre plus celle du
 * référentiel : l'opération ne s'adresse à personne.
 */
export interface EffectiveOperationView {
  readonly isHidden: boolean;
  /** `min(référentiel, surcharge)`. */
  readonly orderUntil: string;
  readonly audience: ReceivedOperationAudience | "none";
  /** La sélection moins les articles retirés, dans l'ordre du rayon. */
  readonly skus: readonly string[];
}

/** Une opération du miroir, telle que l'écran de réception la montre. */
export interface ReceivedOperationView {
  readonly key: string;
  readonly name: ReceivedOperationText;
  readonly lede: ReceivedOperationText | null;
  readonly image: { readonly url: string; readonly alt: string } | null;
  /** Instants ISO. */
  readonly announceFrom: string;
  readonly orderFrom: string | null;
  readonly orderUntil: string;
  /** Jours `AAAA-MM-JJ`. */
  readonly pickupFrom: string;
  readonly pickupUntil: string;
  /** Ce que le référentiel a dit. */
  readonly audience: ReceivedOperationAudience;
  readonly skus: readonly string[];
  readonly receivedAt: string;
  /**
   * `true` = absente du dernier envoi accepté : l'écran dit « opération
   * retirée ». Sa surcharge est gardée — la clé ne se réemploie jamais.
   */
  readonly withdrawn: boolean;
  readonly withdrawnAt: string | null;
  readonly override: OperationOverrideView | null;
  readonly effective: EffectiveOperationView;
}
