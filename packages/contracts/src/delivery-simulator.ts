import { z } from "zod";

import {
  type DeliveryCostEstimate,
  type DeliveryProposalWindow,
  deliveryRoutingSettingsPayloadSchema,
} from "./delivery-routing.js";

/**
 * **Le simulateur de tournée** (`documentation/livraisons/plan-preparation-de-tournee.md`,
 * lot 9, L9-C1 à L9-C6) : le calculateur du lot 7 sur des arrêts INVENTÉS.
 *
 * Une LECTURE : `POST admin/livraison/simulateur` parce que le scénario est un
 * corps, pas parce qu'on écrit. Ni commande, ni tournée, ni géocodage.
 */

export const SIMULATION_MAX_STOPS = 60;
export const SIMULATION_MAX_VEHICLES = 10;

const clockTimeField = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "heure attendue au format HH:MM");

const gpsField = z.object({
  lat: z.number().min(-90, "latitude hors bornes").max(90, "latitude hors bornes"),
  lng: z.number().min(-180, "longitude hors bornes").max(180, "longitude hors bornes"),
});

/** Un arrêt inventé : un libellé, un point, une fenêtre facultative. */
export const simulatedStopSchema = z.object({
  /** Identifiant local à l'écran, rendu tel quel dans la proposition. */
  id: z.string().trim().min(1, "arrêt sans identifiant").max(40),
  label: z.string().trim().min(1, "nom de l'arrêt requis").max(80, "nom trop long"),
  gps: gpsField,
  /** `start` nul = « dès l'ouverture ». Absente : pas de fenêtre. */
  window: z.object({ start: clockTimeField.nullable(), end: clockTimeField }).nullable(),
});
export type SimulatedStop = z.infer<typeof simulatedStopSchema>;

export const deliverySimulationPayloadSchema = z.object({
  stops: z
    .array(simulatedStopSchema)
    .min(1, "au moins un arrêt")
    .max(SIMULATION_MAX_STOPS, `${SIMULATION_MAX_STOPS} arrêts au plus`),
  /** Des NOMS, pas la flotte : « et avec quatre camionnettes ? » (L9-C3). */
  vehicles: z
    .array(z.string().trim().min(1, "nom du véhicule requis").max(60))
    .min(1, "au moins un véhicule")
    .max(SIMULATION_MAX_VEHICLES, `${SIMULATION_MAX_VEHICLES} véhicules au plus`),
  /** Mêmes réglages que le lot 7 ; `defaultMode` est ignoré (toujours `new_rounds`). */
  settings: deliveryRoutingSettingsPayloadSchema,
  /** Point de départ saisi ; absent : le point de départ réglé (lot 2). */
  departure: gpsField.nullable(),
});
export type DeliverySimulationPayload = z.infer<typeof deliverySimulationPayloadSchema>;

export interface SimulatedProposedStopView {
  readonly stopId: string;
  readonly label: string;
  readonly arrival: string;
  readonly window: DeliveryProposalWindow | null;
  readonly windowMissed: boolean;
}

export interface SimulatedRoundView {
  readonly vehicleName: string;
  readonly passage: number;
  readonly departureTime: string;
  readonly returnTime: string;
  readonly meters: number;
  readonly minutes: number;
  readonly overDuration: boolean;
  readonly stops: readonly SimulatedProposedStopView[];
}

/** La proposition simulée. Rien n'est écrit. */
export interface DeliverySimulationView {
  readonly estimate: DeliveryCostEstimate;
  readonly departure: { readonly label: string; readonly lat: number; readonly lng: number };
  readonly rounds: readonly SimulatedRoundView[];
  /** Les arrêts qu'aucune tournée ne tient dans la durée maximale. */
  readonly overflow: readonly { readonly stopId: string; readonly label: string }[];
}
