import { z } from "zod";

import type { BillingAddressPayload, GpsPoint } from "./address.js";

/**
 * **Les bases paramétrables de la livraison** — les véhicules et le point de
 * départ des tournées (`documentation/livraisons/plan-preparation-de-tournee.md`,
 * lot 2). Ce que la composition des tournées lira comme un réglage, jamais comme
 * une constante.
 */

/**
 * Charge d'un véhicule, à la création comme à la correction.
 *
 * La plaque n'est validée ici que dans sa FORME large : c'est le value object du
 * domaine qui la normalise (`AB-123-CD`, `ab 123 cd` et `AB123CD` sont la même)
 * et qui refuse une plaque mal formée, avec la phrase à lire.
 */
export const vehiclePayloadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "nom du véhicule requis")
    .max(60, "nom trop long (60 caractères au plus)"),
  plate: z.string().trim().min(1, "plaque requise").max(20, "plaque trop longue"),
});
export type VehiclePayload = z.infer<typeof vehiclePayloadSchema>;

/** Un véhicule de la flotte. */
export interface VehicleView {
  readonly id: string;
  readonly name: string;
  /** La plaque sous sa forme normalisée, celle qui fait foi pour l'unicité. */
  readonly plate: string;
  /**
   * Retiré le, ou `null` s'il est actif. Une DATE et non un drapeau : la
   * composition lira « actif ce jour-là », et un retrait ne doit pas effacer un
   * véhicule des tournées déjà composées avant lui.
   */
  readonly retiredAt: string | null;
  readonly createdAt: string;
}

/** La flotte, actifs et retirés, dans l'ordre de création. */
export interface VehiclesView {
  readonly vehicles: readonly VehicleView[];
}

/** Charge du réglage « point de départ » : un point de retrait existant. */
export const departurePayloadSchema = z.object({
  pickupAddressId: z.string().trim().min(1, "point de retrait requis"),
});
export type DeparturePayload = z.infer<typeof departurePayloadSchema>;

/**
 * **D'où partent les tournées** : un point de retrait, RÉFÉRENCÉ et jamais
 * recopié — l'adresse du labo n'a qu'une source.
 */
export interface DepartureView {
  /**
   * `explicit` = choisi dans les réglages ; `default` = personne n'a encore
   * choisi, c'est le point de retrait par défaut. `null` quand aucun point de
   * retrait n'existe — l'écran le dit, il n'invente pas d'adresse.
   */
  readonly source: "explicit" | "default";
  readonly point: DeparturePointView | null;
  /** Les points de retrait parmi lesquels choisir. */
  readonly choices: readonly DeparturePointView[];
}

/** Un point de retrait, vu comme point de départ possible. */
export interface DeparturePointView {
  readonly pickupAddressId: string;
  readonly label: string;
  readonly address: BillingAddressPayload;
  /** Sans point GPS, aucune distance ne partira de là : l'écran le signale. */
  readonly gps: GpsPoint | null;
}
