import { z } from "zod";

/**
 * **La composition des tournées d'un jour** — répartir les livraisons entre les
 * véhicules, puis ordonner chaque tournée
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 3, C1–C17).
 *
 * Ne porte que des RÉFÉRENCES : le détail d'un arrêt (adresse, fenêtre, contact,
 * procédure) est celui de la feuille de route, que l'écran relit au même moment
 * et joint par `orderId` (C16).
 */
export interface DeliveryRoundsDayView {
  /** Jour de service, `AAAA-MM-JJ`. */
  readonly day: string;
  readonly rounds: readonly DeliveryRoundView[];
  /**
   * Les livraisons du jour, non annulées, qui ne sont dans AUCUNE tournée
   * vivante. C'est là qu'arrivent les retardataires.
   */
  readonly unassigned: readonly DeliveryRoundOrderRef[];
}

/** Une tournée : un véhicule, un jour, un passage. */
export interface DeliveryRoundView {
  readonly id: string;
  readonly vehicleId: string;
  /** Le nom du véhicule, RECOPIÉ à la création : un renommage ne réécrit pas l'historique. */
  readonly vehicleName: string;
  /** 1, 2… — un véhicule peut faire plusieurs tournées dans la journée (Q13). */
  readonly passage: number;
  /** La version à renvoyer avec toute écriture : une composition changée entre-temps est refusée. */
  readonly version: number;
  /**
   * 🔴 Le véhicule a été retiré avant ce jour : un retrait et une affectation
   * simultanés ont pu passer tous les deux (C14). Signalé, jamais silencieux.
   */
  readonly vehicleRetired: boolean;
  /**
   * Partie le (lot 4, L4-C4), ou `null` : au dépôt. Partie, elle ne se compose
   * plus (I6) — l'écran la montre en lecture seule, et le serveur refuse.
   */
  readonly departedAt: string | null;
  /**
   * Le livreur affecté (plan « Ma tournée », MT-D2 v2), ou `null`. Le nom est
   * LU dans l'annuaire, jamais copié.
   */
  readonly driver: DeliveryRoundDriverView | null;
  /** Les arrêts vivants, dans l'ordre de passage. */
  readonly stops: readonly DeliveryRoundStopView[];
}

/** Le livreur affecté à une tournée. */
export interface DeliveryRoundDriverView {
  readonly staffUserId: string;
  /** « Prénom Nom », ou `null` : la fiche n'existe plus, ou n'a pas de nom. */
  readonly name: string | null;
  /**
   * 🔴 `false` : il a PERDU le droit de conduire (`delivery_driving:write`,
   * rôle et dérogations) ou sa fiche est suspendue. L'écran dit « livreur sans
   * accès — réaffecter » ; sa route le refuse de toute façon (le guard).
   */
  readonly canDrive: boolean;
}

/**
 * Les membres du staff qu'on peut affecter à une tournée : ceux qui ont
 * EFFECTIVEMENT `delivery_driving:write` (rôle et dérogations), fiche non
 * suspendue — pas ceux qui portent la clé `livreur` (MT-D2 v2).
 */
export interface DeliveryDriversView {
  readonly drivers: readonly DeliveryDriverView[];
}

export interface DeliveryDriverView {
  readonly staffUserId: string;
  readonly name: string;
}

/** Un arrêt de tournée. */
export interface DeliveryRoundStopView {
  readonly stopId: string;
  readonly orderId: string;
  /** Le numéro lisible — affiché même quand la feuille du jour ne connaît plus la commande. */
  readonly reference: string;
  /** 1..n, contigu. */
  readonly position: number;
  /**
   * Ce qui cloche, à retirer à la main (Q11) :
   * `cancelled` — la commande a été annulée ;
   * `not_this_day` — sa date de livraison n'est plus ce jour (voir `orderDay`) ;
   * `not_delivery` — elle est passée en retrait au comptoir.
   */
  readonly signals: readonly DeliveryRoundStopSignal[];
  /** Le jour demandé de la commande, aujourd'hui (`AAAA-MM-JJ`), ou `null`. */
  readonly orderDay: string | null;
}

export type DeliveryRoundStopSignal = "cancelled" | "not_this_day" | "not_delivery";

/** Une commande à répartir. */
export interface DeliveryRoundOrderRef {
  readonly orderId: string;
  readonly reference: string;
}

const dayField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ");
const idField = (label: string) => z.string().trim().min(1, `${label} requis`);
const versionField = z.number().int().nonnegative();

/** Ouvrir une tournée : un véhicule actif ce jour-là. Le passage est attribué par le serveur. */
export const openDeliveryRoundPayloadSchema = z.object({
  day: dayField,
  vehicleId: idField("véhicule"),
});
export type OpenDeliveryRoundPayload = z.infer<typeof openDeliveryRoundPayloadSchema>;

/** Affecter une commande à une tournée : elle s'ajoute en dernier. */
export const assignDeliveryStopPayloadSchema = z.object({
  orderId: idField("commande"),
  version: versionField,
});
export type AssignDeliveryStopPayload = z.infer<typeof assignDeliveryStopPayloadSchema>;

/** Déplacer un arrêt vers une autre tournée du même jour (I7) : il s'ajoute en dernier. */
export const moveDeliveryStopPayloadSchema = z.object({
  toRoundId: idField("tournée de destination"),
  fromVersion: versionField,
  toVersion: versionField,
});
export type MoveDeliveryStopPayload = z.infer<typeof moveDeliveryStopPayloadSchema>;

/**
 * Réordonner : la liste COMPLÈTE des arrêts, dans le nouvel ordre. Le serveur
 * refuse ce qui n'est pas une permutation exacte des arrêts vivants (I2).
 */
export const reorderDeliveryRoundPayloadSchema = z.object({
  stopIds: z.array(idField("arrêt")).min(1, "au moins un arrêt"),
  version: versionField,
});
export type ReorderDeliveryRoundPayload = z.infer<typeof reorderDeliveryRoundPayloadSchema>;

/** Retirer un arrêt de sa tournée (Q11 : à la main). */
export const removeDeliveryStopPayloadSchema = z.object({
  version: versionField,
});
export type RemoveDeliveryStopPayload = z.infer<typeof removeDeliveryStopPayloadSchema>;

/** Affecter un livreur à une tournée encore au dépôt (MT-D2). */
export const assignDeliveryDriverPayloadSchema = z.object({
  staffUserId: idField("livreur"),
  version: versionField,
});
export type AssignDeliveryDriverPayload = z.infer<typeof assignDeliveryDriverPayloadSchema>;

/** Retirer le livreur d'une tournée encore au dépôt. */
export const unassignDeliveryDriverPayloadSchema = z.object({
  version: versionField,
});
export type UnassignDeliveryDriverPayload = z.infer<typeof unassignDeliveryDriverPayloadSchema>;
