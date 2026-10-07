import { z } from "zod";

import type { BillingAddressPayload, GpsPoint } from "./address.js";

/**
 * **Les bases paramétrables de la livraison** — les véhicules et le point de
 * départ des tournées (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`,
 * lot 2). Ce que la composition des tournées lira comme un réglage, jamais comme
 * une constante.
 */

/**
 * Dimensions UTILES de l'espace de chargement, en centimètres entiers
 * (lot 2 bis, L2b-C1). Les bornes (1 à 1 000 cm) sont tenues par le domaine,
 * qui refuse avec la phrase à lire : le schéma ne vérifie que la forme.
 */
export const vehicleCargoPayloadSchema = z.object({
  lengthCm: z.number().int(),
  widthCm: z.number().int(),
  heightCm: z.number().int(),
});
export type VehicleCargoPayload = z.infer<typeof vehicleCargoPayloadSchema>;

/**
 * Les passages de roue (`plan-geometrie-du-plancher.md`, G-D2) : UNE paire
 * symétrique, en centimètres entiers — longueur le long du véhicule, saillie de
 * CHAQUE côté, distance depuis le fond, hauteur (des bacs s'empilent
 * par-dessus). Qu'ils tiennent dans le plancher, et
 * qu'il y ait un plancher, est tenu par le domaine.
 */
export const vehicleWheelArchesPayloadSchema = z.object({
  lengthCm: z.number().int(),
  protrusionCm: z.number().int(),
  fromBackCm: z.number().int(),
  heightCm: z.number().int(),
});
export type VehicleWheelArchesPayload = z.infer<typeof vehicleWheelArchesPayloadSchema>;

/**
 * La caisse réfrigérée (lot 2 bis, L2b-C2) : volume en litres, plage en °C
 * entiers — négatifs permis. Bornes, `min ≤ max` et « pas plus que le volume
 * utile » sont tenus par le domaine.
 */
export const vehicleRefrigerationPayloadSchema = z.object({
  volumeLiters: z.number().int(),
  minTempC: z.number().int(),
  maxTempC: z.number().int(),
});
export type VehicleRefrigerationPayload = z.infer<typeof vehicleRefrigerationPayloadSchema>;

/**
 * L'énergie d'un véhicule (lot 2 bis, L2b-C6). `gas` = GNV ou GPL ;
 * `hybrid` = hybride thermique-électrique. Affichée, pas encore lue par le
 * calcul. Ces valeurs sont des DONNÉES rangées en base : elles s'ajoutent, elles
 * ne se renomment pas.
 */
export const VEHICLE_ENERGIES = ["electric", "hybrid", "diesel", "petrol", "gas"] as const;
export const vehicleEnergySchema = z.enum(VEHICLE_ENERGIES);
export type VehicleEnergy = z.infer<typeof vehicleEnergySchema>;

/**
 * Charge d'un véhicule, à la création comme à la correction.
 *
 * La plaque n'est validée ici que dans sa FORME large : c'est le value object du
 * domaine qui la normalise (`AB-123-CD`, `ab 123 cd` et `AB123CD` sont la même)
 * et qui refuse une plaque mal formée, avec la phrase à lire.
 *
 * ⚠️ **La charge est COMPLÈTE, à la correction comme à la création.** `cargo`,
 * `refrigeration` et `energy` sont optionnels pour ne casser aucun appelant d'avant le
 * lot 2 bis, mais **absent vaut `null`** : une correction qui ne les envoie pas
 * EFFACE les dimensions, la caisse réfrigérée ou l'énergie. Absent ne veut jamais dire
 * « inchangé » — l'écran renvoie toujours la fiche entière.
 */
export const vehiclePayloadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "nom du véhicule requis")
    .max(60, "nom trop long (60 caractères au plus)"),
  plate: z.string().trim().min(1, "plaque requise").max(20, "plaque trop longue"),
  /** Dimensions utiles ; `null` ou absent = inconnues (voir la mise en garde ci-dessus). */
  cargo: vehicleCargoPayloadSchema.nullable().optional(),
  /** Passages de roue ; `null` ou absent = plancher rectangle (même règle : absent efface). */
  wheelArches: vehicleWheelArchesPayloadSchema.nullable().optional(),
  /** Caisse réfrigérée ; `null` ou absent = véhicule sec. */
  refrigeration: vehicleRefrigerationPayloadSchema.nullable().optional(),
  /** Énergie ; `null` ou absent = non renseignée (même règle : absent efface). */
  energy: vehicleEnergySchema.nullable().optional(),
  /**
   * Les zones de livraison où le véhicule peut aller (identifiants des zones) ;
   * vide ou absent = partout (même règle : absent efface). La composition
   * n'essaie jamais une commande d'une autre zone dans ce véhicule.
   */
  allowedZoneIds: z.array(z.string().trim().min(1)).max(50).optional(),
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
  /** Dimensions utiles, ou `null` si inconnues (lot 2 bis). */
  readonly cargo: VehicleCargoView | null;
  /** Passages de roue, ou `null` : le plancher est un rectangle (G4). Jamais posés sans `cargo`. */
  readonly wheelArches: VehicleWheelArchesView | null;
  /** Caisse réfrigérée, ou `null` pour un véhicule sec (lot 2 bis). */
  readonly refrigeration: VehicleRefrigerationView | null;
  /** Énergie, ou `null` si non renseignée (L2b-C6). */
  readonly energy: VehicleEnergy | null;
  /**
   * Les zones de livraison autorisées (identifiants), vide = partout. Un
   * identifiant peut ne plus désigner aucune zone (supprimée depuis) : il
   * n'autorise alors rien.
   */
  readonly allowedZoneIds: readonly string[];
}

/**
 * Les dimensions utiles, et le volume en litres qu'on en DÉRIVE
 * (longueur × largeur × hauteur / 1 000, arrondi à l'entier inférieur) :
 * jamais saisi, jamais stocké.
 */
export interface VehicleCargoView {
  readonly lengthCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
  readonly volumeLiters: number;
}

/** Les passages de roue, en cm. */
export interface VehicleWheelArchesView {
  readonly lengthCm: number;
  readonly protrusionCm: number;
  readonly fromBackCm: number;
  readonly heightCm: number;
}

/** La caisse réfrigérée : volume en litres, plage en °C. */
export interface VehicleRefrigerationView {
  readonly volumeLiters: number;
  readonly minTempC: number;
  readonly maxTempC: number;
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
