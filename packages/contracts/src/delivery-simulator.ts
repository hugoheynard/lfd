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
export const SIMULATION_MIN_STOP_MINUTES = 1;
export const SIMULATION_MAX_STOP_MINUTES = 120;
export const SIMULATION_SCENARIO_NAME_MAX = 80;

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
  /**
   * Le temps sur place propre à cet arrêt, en minutes (L9-C8 : celui de
   * l'adresse copiée). Absent : le `stopMinutes` des réglages du scénario.
   */
  stopMinutes: z
    .number()
    .int("minutes entières attendues")
    .min(SIMULATION_MIN_STOP_MINUTES, `au moins ${SIMULATION_MIN_STOP_MINUTES} minute sur place`)
    .max(SIMULATION_MAX_STOP_MINUTES, `${SIMULATION_MAX_STOP_MINUTES} minutes sur place au plus`)
    .optional(),
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

/* ── L9-C7 — les scénarios enregistrés ─────────────────────────────────── */

/**
 * Enregistrer (créer ou remplacer) un scénario. Le scénario est revalidé par
 * le même schéma que la simulation, à l'écriture ET à la relecture.
 */
export const saveDeliverySimulationScenarioPayloadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "nom du scénario requis")
    .max(SIMULATION_SCENARIO_NAME_MAX, `${SIMULATION_SCENARIO_NAME_MAX} caractères au plus`),
  scenario: deliverySimulationPayloadSchema,
});
export type SaveDeliverySimulationScenarioPayload = z.infer<
  typeof saveDeliverySimulationScenarioPayloadSchema
>;

/** Une ligne de la liste des scénarios (non archivés, triés par nom). */
export interface DeliverySimulationScenarioSummaryView {
  readonly id: string;
  readonly name: string;
  readonly stops: number;
  readonly vehicles: number;
  readonly updatedAt: string;
  /** Le nom lisible du staff qui l'a enregistré en dernier ; `null` s'il n'est plus connu. */
  readonly updatedBy: string | null;
}

/** Un scénario rouvert : de quoi remplir l'écran tel quel. */
export interface DeliverySimulationScenarioView {
  readonly id: string;
  readonly name: string;
  readonly scenario: DeliverySimulationPayload;
  readonly updatedAt: string;
}

/* ── L9-C8 — partir d'une vraie journée ────────────────────────────────── */

/**
 * Une journée réelle COPIÉE en scénario : aucun identifiant de commande, rien
 * ne peut écrire dans la vraie composition. `departure` est toujours `null`
 * (le point de départ réglé).
 */
export interface DeliverySimulationFromDayView {
  readonly day: string;
  readonly scenario: DeliverySimulationPayload;
  /** Les livraisons du jour sans point : listées, non chargées. */
  readonly withoutPoint: readonly { readonly reference: string; readonly label: string }[];
}
