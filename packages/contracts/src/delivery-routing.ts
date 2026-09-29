import { z } from "zod";

import type { GpsPoint } from "./address.js";
import type { DeliveryRoundOrderRef } from "./delivery-rounds.js";

/**
 * **Le calculateur de tournée** — ses réglages, « Situer les arrêts »,
 * « Proposer » et « Appliquer »
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 7, L7-C1 à
 * L7-C15).
 *
 * Proposer est une LECTURE : elle n'écrit rien, et ne sort que vers la carte
 * routière (OSRM, notre service).
 * Appliquer renvoie la proposition telle qu'on l'a vue, avec les versions des
 * tournées lues : une composition changée entre-temps est refusée,
 * « reproposez ».
 */

// ─── Les réglages du calcul (L7-C13, L7-C15) ───────────────────────────────

const clockTimeField = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "heure attendue au format HH:MM");

/**
 * Les deux façons de « Proposer » : `insert` place les commandes à répartir
 * DANS les tournées existantes non parties, au moindre surcoût, sans
 * réordonner les arrêts déjà placés ; `new_rounds` ouvre des tournées neuves.
 */
export const deliveryProposalModeSchema = z.enum(["insert", "new_rounds"], {
  message: "mode attendu : insert ou new_rounds",
});
export type DeliveryProposalMode = z.infer<typeof deliveryProposalModeSchema>;

/**
 * Les réglages, validés dans leur FORME : des entiers et une heure. Les bornes
 * (un détour sous ×1, une vitesse de 400 km/h) sont refusées par le domaine,
 * avec la phrase à lire.
 */
export const deliveryRoutingSettingsPayloadSchema = z.object({
  /**
   * Le facteur de détour en centièmes : 140 = « ×1,4 ».
   *
   * @deprecated depuis le lot 10 bis (L10b-C5) : le vol d'oiseau a disparu, le
   * calcul ne le lit plus. Accepté (un écran en ligne l'envoie encore), gardé
   * tel quel sinon ; la colonne reste en base (étendre, basculer, resserrer).
   */
  detourPercent: z.number().int().optional(),
  /** @deprecated comme `detourPercent` (L10b-C5). */
  averageSpeedKmh: z.number().int().optional(),
  /** L'heure de départ au plus tôt, `HH:MM`, heure de Paris. */
  earliestDeparture: clockTimeField,
  /** La durée maximale d'une tournée — aller, arrêts, retour. */
  maxRoundMinutes: z.number().int(),
  /** Le temps moyen passé à chaque livraison (se garer, porter, revenir). */
  stopMinutes: z.number().int(),
  /** Le mode de « Proposer » quand l'écran n'en demande pas (`mode=` l'emporte). */
  defaultMode: deliveryProposalModeSchema,
  /** Un véhicule peut-il faire plusieurs tournées dans la journée ? Non : ce qui ne tient pas déborde. */
  multiplePassages: z.boolean(),
  /**
   * La marge de sécurité avant la fin d'un créneau, en minutes (lot 7 ter,
   * L7t-C1) : arriver dans ces minutes-là coûte au calcul, proportionnellement.
   * Optionnelle pour ne casser aucun écran en ligne ; absente, la valeur en
   * place est gardée. Bornes (0 à 90) au domaine.
   */
  safetyMarginMinutes: z.number().int().optional(),
});
export type DeliveryRoutingSettingsPayload = z.infer<typeof deliveryRoutingSettingsPayloadSchema>;

/** Les réglages tels qu'ils valent maintenant. */
export interface DeliveryRoutingSettingsView extends Omit<
  DeliveryRoutingSettingsPayload,
  "detourPercent" | "averageSpeedKmh" | "safetyMarginMinutes"
> {
  /** La marge avant la fin d'un créneau (L7t-C1) — toujours rendue, 20 par défaut. */
  readonly safetyMarginMinutes: number;
  /** @deprecated rendu tant qu'un écran en ligne le lit ; le calcul ne s'en sert plus (L10b-C5). */
  readonly detourPercent: number;
  /** @deprecated comme `detourPercent`. */
  readonly averageSpeedKmh: number;
  /** `default` : personne n'a encore réglé, ce sont les valeurs d'usine. */
  readonly source: "explicit" | "default";
}

// ─── Situer les arrêts (L7-C9) ─────────────────────────────────────────────
// « Situer » est un GESTE sans charge ni réponse (`POST …/situer?jour=`, 204) :
// ce qu'il n'a pas su situer, « Proposer » le dit ensuite, arrêt par arrêt
// (`unlocated`, raison `not_geocoded`).

// ─── Proposer (L7-C3 à C5, C12, C15) ───────────────────────────────────────

/** Une fenêtre `HH:MM` ; `start` nul = « dès l'ouverture ». */
export interface DeliveryProposalWindow {
  readonly start: string | null;
  readonly end: string;
}

/** Un arrêt proposé, dans l'ordre de passage. */
export interface DeliveryProposedStopView {
  readonly orderId: string;
  readonly reference: string;
  /** L'heure d'arrivée ESTIMÉE (`HH:MM`) — par la route, pas une promesse. */
  readonly arrival: string;
  readonly window: DeliveryProposalWindow | null;
  /** L'arrivée estimée tombe après la fin de la fenêtre : signalé, pas refusé (L7-C4). */
  readonly windowMissed: boolean;
}

/**
 * Une tournée proposée : existante (`roundId`) ou à ouvrir (`null`). En mode
 * `insert`, une tournée existante porte TOUS ses arrêts : les placés à la main
 * dans leur ordre relatif, les insérés à leur place.
 */
export interface DeliveryProposedRoundView {
  readonly roundId: string | null;
  readonly vehicleId: string;
  readonly vehicleName: string;
  /**
   * Le rang du passage de ce véhicule DANS LA PROPOSITION (1, 2…). Le numéro
   * définitif d'une tournée à ouvrir est tiré à l'application.
   */
  readonly passage: number;
  /** Départ et retour estimés, `HH:MM`. */
  readonly departureTime: string;
  readonly returnTime: string;
  readonly meters: number;
  readonly minutes: number;
  /** Dépasse la durée maximale (un arrêt qu'on ne pouvait pas déplacer). */
  readonly overDuration: boolean;
  readonly stops: readonly DeliveryProposedStopView[];
  /**
   * Le tracé par la route (`/route` d'OSRM, `overview=simplified`), en paires
   * `[lng, lat]` — l'ordre de GeoJSON. `null` si OSRM ne l'a pas rendu : la
   * carte montre les repères sans tracé (L10b-C4). Jamais une erreur.
   */
  readonly geometry: readonly (readonly [number, number])[] | null;
}

/** Pourquoi une commande n'est pas située (L7-C1). */
export type DeliveryUnlocatedReason = "no_address" | "not_geocoded";

export interface DeliveryUnlocatedOrderView extends DeliveryRoundOrderRef {
  readonly reason: DeliveryUnlocatedReason;
}

/**
 * Pourquoi une tournée existante n'est pas dans `rounds` : partie, chargée
 * (recomposition), un arrêt non situé ou signalé, non demandée (sans « tout
 * recomposer », ou véhicule non coché), ou `unchanged` — éligible à
 * l'insertion, mais rien n'y a été inséré.
 */
export type DeliveryKeptRoundReason =
  "departed" | "loaded" | "unlocated_stop" | "signaled_stop" | "not_requested" | "unchanged";

export interface DeliveryKeptRoundView {
  readonly roundId: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly reason: DeliveryKeptRoundReason;
}

/** La version lue d'une tournée, à renvoyer telle quelle à l'application. */
export interface DeliveryRoundVersionRef {
  readonly roundId: string;
  readonly version: number;
}

/**
 * D'où viennent les durées d'une proposition (L8-C3).
 *
 * @deprecated depuis le lot 10 bis (L10b-C5) : toujours `road` — sans calcul
 * routier, Proposer refuse. Le type reste pour ne pas casser un écran en ligne.
 */
export type DeliveryCostEstimate = "road" | "crow_flies";

/** **La proposition** : un aperçu calculé, jamais écrit. */
export interface DeliveryRoundProposalView {
  readonly day: string;
  /**
   * @deprecated vaut toujours `road` depuis le lot 10 bis (L10b-C5) : sans
   * calcul routier, Proposer refuse au lieu de retomber sur le vol d'oiseau.
   * Rendu tant qu'un écran en ligne le lit.
   */
  readonly estimate: DeliveryCostEstimate;
  /** Le mode effectivement appliqué : le paramètre `mode`, sinon le réglage. */
  readonly mode: DeliveryProposalMode;
  readonly departurePoint: {
    readonly pickupAddressId: string;
    readonly label: string;
    readonly gps: GpsPoint;
  };
  readonly settings: DeliveryRoutingSettingsView;
  readonly rounds: readonly DeliveryProposedRoundView[];
  /** Sans point : exclues, à répartir à la main. */
  readonly unlocated: readonly DeliveryUnlocatedOrderView[];
  /** Situées, mais qu'aucune tournée ne peut tenir dans la durée maximale. */
  readonly overflow: readonly DeliveryRoundOrderRef[];
  /** Les tournées du jour que la proposition ne touche pas, et pourquoi. */
  readonly kept: readonly DeliveryKeptRoundView[];
  /** Les versions de TOUTES les tournées du jour lues. */
  readonly versions: readonly DeliveryRoundVersionRef[];
}

/**
 * `GET …/tournees/proposition` — `jour=AAAA-MM-JJ` ; `vehicules=id1,id2`
 * (absent : ceux qui roulent ce jour-là) ; `toutRecomposer=true|false` (vrai :
 * recompose, et le mode est ignoré) ; `mode=insert|new_rounds` (absent : le
 * `defaultMode` des réglages).
 */

// ─── Appliquer (L7-C6, C11, C14) ───────────────────────────────────────────

const idField = (label: string) => z.string().trim().min(1, `${label} requis`);
const dayField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ");

/**
 * Appliquer une proposition : chaque tournée avec la liste COMPLÈTE de ses
 * commandes dans l'ordre de passage, et les versions lues. Tout ou rien.
 */
export const applyDeliveryProposalPayloadSchema = z.object({
  day: dayField,
  rounds: z
    .array(
      z.object({
        roundId: idField("tournée").nullable(),
        vehicleId: idField("véhicule"),
        orderIds: z.array(idField("commande")),
      }),
    )
    .min(1, "au moins une tournée"),
  versions: z.array(z.object({ roundId: idField("tournée"), version: z.number().int().min(0) })),
});
export type ApplyDeliveryProposalPayload = z.infer<typeof applyDeliveryProposalPayloadSchema>;

// ─── Chronométrer (lot 10 bis, L10b-C2) ────────────────────────────────────

/**
 * Chronométrer une composition éditée à la main (glisser-déposer) : chaque
 * tournée avec ses commandes DANS l'ordre voulu. Une LECTURE : rien n'est
 * écrit, la composition est chronométrée telle quelle, sans réordonner.
 */
export const timeDeliveryRoundsPayloadSchema = z.object({
  day: dayField,
  rounds: z
    .array(
      z.object({
        roundId: idField("tournée").nullable(),
        vehicleId: idField("véhicule"),
        orderIds: z.array(idField("commande")).min(1, "au moins une commande par tournée"),
      }),
    )
    .min(1, "au moins une tournée"),
});
export type TimeDeliveryRoundsPayload = z.infer<typeof timeDeliveryRoundsPayloadSchema>;

/** La composition chronométrée, dans l'ordre reçu. */
export interface DeliveryRoundTimingView {
  readonly day: string;
  readonly rounds: readonly DeliveryProposedRoundView[];
}
