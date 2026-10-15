import type { DeliveryZoneView, VehicleView, VehiclesView } from '@lfd/contracts';

import { splitFleet } from '../livraison/fleet';
import { energyLabel } from '../livraison/vehicle-energy';
import { zonesLine } from '../livraison/vehicle-zones';

/**
 * **Les véhicules en texte**, pour un agent — ce que la flotte
 * (Réglages → Livraison → Véhicules) montre : identité, chargement, froid,
 * énergie, zones, et surtout les AVERTISSEMENTS (`gaps`, 2026-10-14) que la
 * fiche affiche quand une donnée manque. Les phrases d'avertissement viennent
 * du serveur telles quelles : ce sont celles que lit le bureau.
 */

function cargoPart(vehicle: VehicleView): string {
  const cargo = vehicle.cargo;
  if (cargo === null) {
    return 'cotes utiles inconnues';
  }
  return `cotes utiles ${cargo.lengthCm} × ${cargo.widthCm} × ${cargo.heightCm} cm (${cargo.volumeLiters} L)`;
}

function archesPart(vehicle: VehicleView): string | null {
  const arches = vehicle.wheelArches;
  if (arches === null) {
    return vehicle.cargo === null ? null : 'passages de roue non renseignés';
  }
  return `passages de roue ${arches.lengthCm} cm de long, ${arches.protrusionCm} cm de saillie, à ${arches.fromBackCm} cm du fond, ${arches.heightCm} cm de haut`;
}

function coldPart(vehicle: VehicleView): string {
  const cold = vehicle.refrigeration;
  return cold === null
    ? 'sec (pas de caisse réfrigérée)'
    : `caisse réfrigérée ${cold.volumeLiters} L, ${cold.minTempC} à ${cold.maxTempC} °C`;
}

/** Un véhicule en quelques lignes : l'en-tête, le détail, puis chaque avertissement. */
export function vehicleText(
  vehicle: VehicleView,
  zones: readonly DeliveryZoneView[] | null,
): string {
  const state = vehicle.retiredAt === null ? 'ACTIF' : `RETIRÉ le ${vehicle.retiredAt}`;
  const detail = [
    cargoPart(vehicle),
    archesPart(vehicle),
    coldPart(vehicle),
    `énergie ${energyLabel(vehicle.energy) ?? 'non renseignée'}`,
    zonesLine(vehicle.allowedZoneIds, zones) ?? 'toutes zones',
    vehicle.allowedZoneIds.length === 0 ? null : `ids de zone ${vehicle.allowedZoneIds.join(', ')}`,
  ].filter((part): part is string => part !== null);
  return [
    `${state} — « ${vehicle.name} » — id ${vehicle.id} — plaque ${vehicle.plate ?? 'aucune'}`,
    `  · ${detail.join(' — ')}`,
    ...vehicle.gaps.map((gap) => `  ⚠ ${gap.code} — ${gap.message}`),
  ].join('\n');
}

/** La flotte : les actifs dans l'ordre de création, puis les retirés, le plus récent d'abord. */
export function fleetText(view: VehiclesView, zones: readonly DeliveryZoneView[] | null): string {
  const { active, retired } = splitFleet(view.vehicles);
  if (active.length === 0 && retired.length === 0) {
    return 'La flotte est vide : aucun véhicule n’a été créé.';
  }
  const incomplete = active.filter((vehicle) => vehicle.gaps.length > 0).length;
  return [
    `${active.length} véhicule(s) actif(s), dont ${incomplete} avec des données manquantes ; ${retired.length} retiré(s).`,
    ...[...active, ...retired].map((vehicle) => vehicleText(vehicle, zones)),
  ].join('\n');
}
