import { DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les zones autorisées d'un véhicule sont mal formées : un identifiant vide,
 * ou plus de zones qu'une fiche n'en porte. L'écran les choisit dans la liste
 * des zones de livraison ; ce refus ne se lit que d'un appel hors de l'écran.
 */
export class InvalidVehicleZonesError extends DomainError {
  constructor(maxZones: number) {
    super(
      "delivery.vehicle_zones_invalid",
      `Les zones autorisées du véhicule sont mal formées : choisissez-les dans la liste des zones de livraison (${maxZones} au plus), ou laissez la liste vide pour « partout ».`,
    );
  }
}
