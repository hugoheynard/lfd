/**
 * **Ce qu'un véhicule ne peut pas faire tant qu'une donnée manque**
 * (Hugo, 2026-10-14 : « seul le nom devrait être obligatoire, ensuite des
 * warnings pour dire ce qu'on ne peut pas faire tant qu'on n'a pas telle
 * donnée »).
 *
 * Des avertissements, jamais des refus : la fiche s'enregistre sans eux.
 * Chaque phrase décrit ce que le code FAIT d'une donnée absente — vérifié le
 * 2026-10-14 dans les fichiers cités :
 *
 * - **plaque** — aucun geste de livraison ne la lit (ni la feuille de route,
 *   ni le plan de chargement, ni la composition) ; seule l'unicité entre
 *   véhicules en service s'en sert (`ensurePlateFree`, index partiel), et elle
 *   ne protège donc pas un véhicule sans plaque d'une double saisie ;
 * - **cotes utiles** — le véhicule ne compte pas dans le socle de la
 *   composition (`PrismaMeasuredVehiclesReader`, `ensureComposable`), la
 *   composition ne lui confie aucun arrêt qui a des bacs (`capacity-guard.ts`,
 *   `round-place.ts` : `floor === null`), et le plan de chargement ne sait pas
 *   dire si les bacs tiennent (`loading-warnings.ts`, `unknown_cargo`) ;
 * - **passages de roue** — sans eux le plancher est un rectangle
 *   (`CargoFloor`, `wheelArches: null`) : le placement des piles peut poser
 *   des bacs là où les passages sont. Ne se dit que si les cotes existent :
 *   les passages ne se posent jamais sans elles.
 *
 * Le froid et l'énergie n'y sont pas : un véhicule sans caisse réfrigérée est
 * un véhicule SEC, pas une donnée manquante, et l'énergie n'est lue par aucun
 * calcul.
 */

/** Le code stable d'une donnée manquante. */
export type VehicleGapCode = "no_plate" | "no_cargo" | "no_wheel_arches";

/** Un avertissement : son code, et la phrase lue au bureau. */
export interface VehicleGap {
  readonly code: VehicleGapCode;
  readonly message: string;
}

/** Ce que la règle lit d'un véhicule — l'agrégat comme la vue y répondent. */
export interface VehicleGapInput {
  readonly name: string;
  readonly plate: unknown;
  readonly cargo: unknown;
  readonly wheelArches: unknown;
}

/** Les avertissements d'un véhicule, dans l'ordre de la fiche ; vide si rien ne manque. */
export function vehicleGaps(vehicle: VehicleGapInput): readonly VehicleGap[] {
  const name = `« ${vehicle.name} »`;
  const gaps: VehicleGap[] = [];
  if (vehicle.plate === null) {
    gaps.push({
      code: "no_plate",
      message: `${name} n'a pas de plaque : aucun geste de livraison ne la demande, mais rien n'empêche de saisir ce véhicule deux fois. Renseignez-la dès que vous l'avez.`,
    });
  }
  if (vehicle.cargo === null) {
    gaps.push({
      code: "no_cargo",
      message: `${name} n'a pas ses cotes utiles (longueur, largeur, hauteur) : il ne compte pas parmi les véhicules qui permettent de proposer des tournées, la composition ne lui confie aucun arrêt qui a des bacs, et son plan de chargement ne peut pas dire si les bacs tiennent.`,
    });
  } else if (vehicle.wheelArches === null) {
    gaps.push({
      code: "no_wheel_arches",
      message: `Les passages de roue de ${name} ne sont pas renseignés : le plan de chargement compte son plancher comme un rectangle, et peut poser des bacs là où sont les passages. Laissez vide seulement si le plancher n'en a pas.`,
    });
  }
  return gaps;
}
