import { z } from "zod";

/**
 * **Le chargement, véhicule par véhicule** — les sacs, leur chargement, et le
 * départ qui gèle une tournée
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 4, v4 :
 * L4-C11 à L4-C21, Q14–Q21).
 *
 * Un sac naît quand on le DÉCLARE (L4-C16) ; l'imprimer est une lecture. Le sac
 * appartient à la commande, son chargement appartient à l'arrêt (L4-C18).
 */

/** Déclarer des sacs pour une commande : `count` sacs de plus. */
export const declareDeliveryBagsPayloadSchema = z.object({
  orderId: z.string().trim().min(1, "commande requise"),
  count: z
    .number()
    .int("un nombre entier de sacs")
    .min(1, "au moins un sac")
    .max(20, "vingt sacs au plus par déclaration"),
});
export type DeclareDeliveryBagsPayload = z.infer<typeof declareDeliveryBagsPayloadSchema>;

/** Un sac. */
export interface DeliveryBagView {
  readonly bagId: string;
  /** Six caractères, Crockford base 32 : ce qu'on tape quand le QR est illisible. */
  readonly code: string;
  readonly orderId: string;
  readonly reference: string;
  /** L'enseigne, ou la raison sociale — ce qu'on lit sur l'étiquette. */
  readonly customerLabel: string;
  /** Rang du sac parmi les sacs non annulés de la commande, 1..n. `null` s'il est annulé. */
  readonly index: number | null;
  /** Nombre de sacs non annulés de la commande. */
  readonly total: number;
  readonly voidedAt: string | null;
}

/** Les sacs d'une commande — pour le colisage et la page d'étiquettes imprimable. */
export interface DeliveryOrderBagsView {
  readonly orderId: string;
  readonly reference: string;
  readonly bags: readonly DeliveryBagView[];
}

/**
 * **Ce qu'on voit en ouvrant le QR d'un sac** (`/livraison/sac/{bagId}`). Une
 * LECTURE : ouvrir ne charge rien (L4-C13) ; « Charger » est un geste.
 */
export interface DeliveryBagDetailView {
  readonly bag: DeliveryBagView;
  /** La tournée vivante qui porte la commande, ou `null` : « à répartir d'abord ». */
  readonly round: {
    readonly roundId: string;
    readonly day: string;
    readonly vehicleName: string;
    readonly passage: number;
    readonly departedAt: string | null;
  } | null;
  /** Chargé dans CETTE tournée, le, ou `null`. */
  readonly loadedAt: string | null;
}

/** L'état d'un arrêt au chargement. */
export type DeliveryLoadingStopState =
  /** 🔴 aucun sac non annulé : « Partir » le refuse (L4-C17). */
  | "unlabelled"
  /** des sacs restent à charger. */
  | "partial"
  /** tous ses sacs non annulés sont chargés. */
  | "loaded";

/** Un arrêt vu du dépôt. */
export interface DeliveryLoadingStopView {
  readonly stopId: string;
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly position: number;
  readonly state: DeliveryLoadingStopState;
  readonly bags: readonly {
    readonly bagId: string;
    readonly code: string;
    readonly index: number;
    readonly loadedAt: string | null;
  }[];
}

/** **Le chargement d'une tournée** — ce qui manque encore à CE véhicule. */
export interface DeliveryLoadingRoundView {
  readonly roundId: string;
  readonly day: string;
  readonly vehicleName: string;
  readonly passage: number;
  /** La version de la tournée, à renvoyer avec « Partir ». */
  readonly version: number;
  /** Partie le, ou `null`. Partie : plus rien ne se compose ni ne se charge (I6). */
  readonly departedAt: string | null;
  readonly stops: readonly DeliveryLoadingStopView[];
}

/** Une tournée du jour, vue du dépôt — de quoi choisir le véhicule à charger. */
export interface DeliveryLoadingRoundSummaryView {
  readonly roundId: string;
  readonly vehicleName: string;
  readonly passage: number;
  /** Partie le, ou `null`. */
  readonly departedAt: string | null;
  /** Les arrêts vivants de la tournée. */
  readonly stops: number;
  /** Parmi eux, ceux dont tous les sacs non annulés sont chargés (`loaded`, L4-C17). */
  readonly loadedStops: number;
}

/**
 * **Les tournées d'un jour, vues du dépôt** (`GET admin/livraison/chargement?jour=`)
 * — sous `delivery_loading:read`, pour que l'écran de chargement ne demande pas
 * aussi le droit de composer.
 */
export interface DeliveryLoadingDayView {
  readonly day: string;
  /** Véhicule par véhicule (ordre de la flotte), puis par passage — l'ordre de la composition. */
  readonly rounds: readonly DeliveryLoadingRoundSummaryView[];
}

/**
 * Charger un sac dans une tournée : par son identifiant (QR) ou par son code
 * court (tapé). Exactement l'un des deux.
 */
export const loadDeliveryBagPayloadSchema = z.union([
  z.object({ bagId: z.string().trim().min(1, "sac requis") }),
  z.object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[0-9A-HJKMNP-TV-Z]{6}$/u, "code de sac : six caractères"),
  }),
]);
export type LoadDeliveryBagPayload = z.infer<typeof loadDeliveryBagPayloadSchema>;

/** Partir : la version de la tournée lue au chargement. */
export const departDeliveryRoundPayloadSchema = z.object({
  version: z.number().int().nonnegative(),
});
export type DepartDeliveryRoundPayload = z.infer<typeof departDeliveryRoundPayloadSchema>;
