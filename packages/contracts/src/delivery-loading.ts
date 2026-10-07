import { z } from "zod";

import type { DeliveryOrderRoundPlaceView } from "./delivery-packing.js";

/**
 * **Le chargement, véhicule par véhicule** — les bacs déclarés, leur
 * chargement, et le départ qui gèle une tournée
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 4, v4 :
 * L4-C11 à L4-C21 ; lot 4 bis, v2-4 et v2-6, tranche B).
 *
 * Tout part en BAC, et on scanne le bac (Hugo, 2026-09-29) : l'unité scannée
 * est un bac ENTIER, ou une MOITIÉ de bac cloisonné — un QR chacun. Les sacs
 * posés dedans ne sont qu'un compte informatif, imprimé sur l'étiquette.
 *
 * Un bac naît quand on le DÉCLARE (L4-C16) ; l'imprimer est une lecture. Le bac
 * appartient à la commande, son chargement appartient à l'arrêt (L4-C18).
 *
 * Routes (`admin/livraison/…`, sous `delivery_loading`) :
 *
 * - `POST colisage/bacs` ({@link DeclareDeliveryBinsPayload}) → {@link DeclaredDeliveryBinsResponse} ;
 * - `POST colisage/bacs/partage` ({@link ShareDeliveryBinPayload}) → {@link SharedDeliveryBinResponse} ;
 * - `GET colisage/bacs?commande=` → {@link DeliveryOrderBinsView} ;
 * - `GET colisage/bacs/:binId` → {@link DeliveryBinDetailView} (le QR ouvert) ;
 * - `POST colisage/bacs/:binId/annulation` → 204 ;
 * - `GET chargement?jour=` → {@link DeliveryLoadingDayView} ;
 * - `GET chargement/:roundId` → {@link DeliveryLoadingRoundView} ;
 * - `POST chargement/:roundId/bacs` ({@link LoadDeliveryBinPayload}) → 204 ;
 * - `POST chargement/:roundId/bacs/:binId/dechargement` → 204 ;
 * - `POST tournees/:roundId/depart` ({@link DepartDeliveryRoundPayload}) → 204.
 *
 * Les routes `…/sacs` et `…/sac/:id` du lot 4 n'existent plus : le lot 4 n'a
 * jamais été servi en production (v2-6), le renommage est franc.
 */

/** Au plus tant de bacs entiers par déclaration. */
export const DELIVERY_BINS_PER_DECLARATION_MAX = 20;
/** Au plus tant de sacs posés dans un bac. */
export const DELIVERY_BIN_INNER_BAGS_MAX = 50;

/** Une moitié de bac cloisonné. `null` ailleurs = un bac entier. */
export const deliveryBinHalfSchema = z.enum(["left", "right"]);
export type DeliveryBinHalf = z.infer<typeof deliveryBinHalfSchema>;

/**
 * Déclarer des bacs d'UN type pour une commande : `whole` bacs entiers, et
 * `half: true` pour une moitié de plus (la gauche d'un bac physique neuf, dont
 * la droite reste libre). Au moins un bac. `innerBags` s'applique à CHAQUE bac
 * déclaré ici. Les bornes et la cloison sont tenues par le domaine (400).
 */
export const declareDeliveryBinsPayloadSchema = z.object({
  orderId: z.string().trim().min(1, "commande requise"),
  binTypeId: z.string().trim().min(1, "type de bac requis"),
  whole: z.number().int("un nombre entier de bacs"),
  half: z.boolean(),
  innerBags: z.number().int("un nombre entier de sacs"),
});
export type DeclareDeliveryBinsPayload = z.infer<typeof declareDeliveryBinsPayloadSchema>;

/**
 * Déclarer, pour une commande, l'AUTRE moitié d'un bac dont une moitié est
 * déjà déclarée pour une autre commande (v2-4, dernier recours). Refusé si les
 * deux commandes ne sont pas dans la même tournée vivante, à des arrêts
 * consécutifs. Même type que la moitié partenaire, côté opposé.
 */
export const shareDeliveryBinPayloadSchema = z.object({
  orderId: z.string().trim().min(1, "commande requise"),
  partnerBinId: z.string().trim().min(1, "moitié partenaire requise"),
  innerBags: z.number().int("un nombre entier de sacs"),
});
export type ShareDeliveryBinPayload = z.infer<typeof shareDeliveryBinPayloadSchema>;

/**
 * Ce que rend une déclaration : les bacs créés, dans l'ordre de déclaration
 * (les entiers, puis la moitié) — de quoi ouvrir leurs étiquettes sans relire.
 */
export interface DeclaredDeliveryBinsResponse {
  readonly binIds: readonly string[];
}

/** Ce que rend un partage : la moitié créée pour la commande. */
export interface SharedDeliveryBinResponse {
  readonly binId: string;
}

/** Le type d'un bac déclaré, tel qu'on l'imprime. Archivé : toujours lisible (v2-7). */
export interface DeliveryBinTypeRef {
  readonly id: string;
  readonly name: string;
  readonly isotherm: boolean;
  readonly archived: boolean;
}

/** L'autre commande d'un bac partagé — ce qu'imprime « partagé avec … ». */
export interface DeliveryBinPartnerView {
  readonly binId: string;
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
}

/** Un bac déclaré — entier, ou une moitié. */
export interface DeliveryBinView {
  readonly binId: string;
  /** Six caractères, Crockford base 32 : ce qu'on tape quand le QR est illisible. */
  readonly code: string;
  readonly orderId: string;
  readonly reference: string;
  /** L'enseigne, ou la raison sociale — ce qu'on lit sur l'étiquette. */
  readonly customerLabel: string;
  /** Rang du bac parmi les bacs non annulés de la commande, 1..n. `null` s'il est annulé. */
  readonly index: number | null;
  /** Nombre de bacs non annulés de la commande (une moitié compte pour un). */
  readonly total: number;
  readonly voidedAt: string | null;
  readonly binType: DeliveryBinTypeRef;
  /** `null` = bac entier. */
  readonly half: DeliveryBinHalf | null;
  /** Le bac physique d'une moitié, partagé par ses deux moitiés ; `null` pour un bac entier. */
  readonly physicalBinId: string | null;
  /** Les sacs posés dedans pour CETTE commande — informatif. */
  readonly innerBags: number;
  /** L'autre moitié NON annulée du même bac physique, si elle est à une autre commande. */
  readonly sharedWith: DeliveryBinPartnerView | null;
  /**
   * 🔴 **À refaire** (v2-4) : bac partagé dont les deux commandes ne sont plus
   * dans la même tournée vivante à des arrêts consécutifs. CALCULÉ à la
   * lecture, jamais écrit ; « Partir » refuse l'arrêt. Toujours `false` pour
   * un bac non partagé.
   */
  readonly toRedo: boolean;
}

/** Les bacs d'une commande — pour le colisage et la page d'étiquettes imprimable. */
export interface DeliveryOrderBinsView {
  readonly orderId: string;
  readonly reference: string;
  readonly bins: readonly DeliveryBinView[];
  /**
   * La tournée vivante de la commande et la position de son arrêt, ou `null`
   * hors tournée — l'étiquette les imprime en gros pour poser le bac dans la
   * pièce (`decisions-par-defaut-2026-10-02.md`, lot PC3).
   */
  readonly round: DeliveryOrderRoundPlaceView | null;
}

/**
 * **Ce qu'on voit en ouvrant le QR d'un bac** (`/livraison/bac/{binId}` côté
 * écran). Une LECTURE : ouvrir ne charge rien (L4-C13) ; « Charger » est un geste.
 */
export interface DeliveryBinDetailView {
  readonly bin: DeliveryBinView;
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
  /** 🔴 aucun bac non annulé : « Partir » le refuse (L4-C17). */
  | "unlabelled"
  /** des bacs restent à charger. */
  | "partial"
  /** tous ses bacs non annulés sont chargés. */
  | "loaded";

/** Un bac d'un arrêt, vu du dépôt. */
export interface DeliveryLoadingBinView {
  readonly binId: string;
  readonly code: string;
  readonly index: number;
  readonly binTypeName: string;
  readonly half: DeliveryBinHalf | null;
  readonly innerBags: number;
  /** Référence de l'autre commande d'un bac partagé, ou `null`. */
  readonly sharedWithReference: string | null;
  /** 🔴 bac partagé à refaire : « Partir » refuse l'arrêt (v2-4). */
  readonly toRedo: boolean;
  readonly loadedAt: string | null;
}

/** Un arrêt vu du dépôt. */
export interface DeliveryLoadingStopView {
  readonly stopId: string;
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly position: number;
  readonly state: DeliveryLoadingStopState;
  readonly bins: readonly DeliveryLoadingBinView[];
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
  /** Parmi eux, ceux dont tous les bacs non annulés sont chargés (`loaded`, L4-C17). */
  readonly loadedStops: number;
  /** Parmi eux, ceux qui portent un bac partagé à refaire (v2-4). */
  readonly stopsWithBinToRedo: number;
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
 * Charger un bac (ou une moitié) dans une tournée : par son identifiant (QR)
 * ou par son code court (tapé). Exactement l'un des deux.
 */
export const loadDeliveryBinPayloadSchema = z.union([
  z.object({ binId: z.string().trim().min(1, "bac requis") }),
  z.object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[0-9A-HJKMNP-TV-Z]{6}$/u, "code de bac : six caractères"),
  }),
]);
export type LoadDeliveryBinPayload = z.infer<typeof loadDeliveryBinPayloadSchema>;

/** Partir : la version de la tournée lue au chargement. */
export const departDeliveryRoundPayloadSchema = z.object({
  version: z.number().int().nonnegative(),
});
export type DepartDeliveryRoundPayload = z.infer<typeof departDeliveryRoundPayloadSchema>;
