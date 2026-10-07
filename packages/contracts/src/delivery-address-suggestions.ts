import { z } from "zod";

import { gpsPointSchema, type GpsPoint } from "./address.js";

/**
 * **Les corrections du carnet suggérées au bureau**
 * (`documentation/livraisons/livreur/gps-y-aller-et-position.md`, §6).
 *
 * Deux points d'une adresse de livraison peuvent être suggérés :
 * - `door` — **la porte** : là où les remises concordent. Appliquée, elle
 *   devient le point GPS de l'adresse (`DeliverySpecs.gps`), qui passe avant
 *   tout géocodage ;
 * - `parking` — **le stationnement** : là où les arrivées concordent.
 */
export const ADDRESS_POINT_KINDS = ["door", "parking"] as const;
export type AddressPointKind = (typeof ADDRESS_POINT_KINDS)[number];
export const addressPointKindSchema = z.enum(ADDRESS_POINT_KINDS);

/**
 * D'où vient le point auquel la suggestion se compare : le carnet (`carnet`),
 * le géocodage de l'adresse faute de point au carnet (`geocode`), ou rien
 * (`none` — la distance est alors inconnue).
 */
export const ADDRESS_POINT_REFERENCES = ["carnet", "geocode", "none"] as const;
export type AddressPointReference = (typeof ADDRESS_POINT_REFERENCES)[number];

/**
 * Une suggestion. **Aucune position de livreur n'y figure** : le point
 * suggéré est le centre de plusieurs gestes concordants, sans auteur ni heure.
 */
export interface AddressPointSuggestionView {
  readonly addressId: string;
  readonly kind: AddressPointKind;
  /** La raison sociale du client. */
  readonly customerLabel: string;
  /** Le libellé de l'adresse au carnet (« Hôtel du Parc — livraisons »). */
  readonly addressLabel: string;
  /** L'adresse en une ligne, telle que le carnet la porte aujourd'hui. */
  readonly addressText: string;
  /** Le point suggéré. */
  readonly suggested: GpsPoint;
  /** Le point actuel auquel elle se compare, ou `null`. */
  readonly recorded: GpsPoint | null;
  readonly reference: AddressPointReference;
  /** L'écart en mètres, arrondi ; `null` sans point de comparaison. */
  readonly distanceM: number | null;
  /** Combien de gestes concordent (au moins le seuil). */
  readonly concordant: number;
}

/** La liste servie au bureau. */
export interface AddressPointSuggestionsView {
  readonly suggestions: readonly AddressPointSuggestionView[];
  /** Le seuil de concordance, pour le dire à l'écran. */
  readonly minConcordant: number;
  /** L'écart minimal, en mètres, à partir duquel une suggestion naît. */
  readonly minGapM: number;
}

/**
 * Appliquer ou ignorer : le bureau renvoie le point qu'il a VU. Si la
 * suggestion a bougé depuis, le serveur refuse (409) plutôt que d'écrire un
 * point que personne n'a regardé.
 */
export const addressPointDecisionPayloadSchema = z.object({
  kind: addressPointKindSchema,
  point: gpsPointSchema,
});
export type AddressPointDecisionPayload = z.infer<typeof addressPointDecisionPayloadSchema>;
