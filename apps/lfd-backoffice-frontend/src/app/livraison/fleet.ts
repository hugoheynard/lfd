import type { DeparturePointView, VehicleView } from '@lfd/contracts';

/** La flotte coupée en deux : ce qui roule, et ce qui a été retiré. */
export interface Fleet {
  readonly active: readonly VehicleView[];
  /** Les retirés, le plus récemment retiré en tête. */
  readonly retired: readonly VehicleView[];
}

/**
 * Sépare les actifs des retirés.
 *
 * Les actifs gardent l'ordre du serveur (celui de la création) ; les retirés
 * se lisent du plus récent au plus ancien, parce qu'on vient y chercher celui
 * qu'on vient de sortir, pas celui d'il y a deux ans.
 */
export function splitFleet(vehicles: readonly VehicleView[]): Fleet {
  const active = vehicles.filter((vehicle) => vehicle.retiredAt === null);
  const retired = vehicles
    .filter((vehicle) => vehicle.retiredAt !== null)
    .sort((a, b) => (b.retiredAt ?? '').localeCompare(a.retiredAt ?? ''));
  return { active, retired };
}

const RETIRED_DAY = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeZone: 'Europe/Paris',
});

/** « retiré le 12 septembre 2026 » — le jour à Paris, pas en UTC. */
export function retiredOnLabel(retiredAt: string): string {
  return `retiré le ${RETIRED_DAY.format(new Date(retiredAt))}`;
}

/** La plaque d'un véhicule, ou « Sans plaque » : elle est facultative depuis le 2026-10-14. */
export function plateLabel(plate: string | null): string {
  return plate ?? 'Sans plaque';
}

/**
 * Le badge d'une fiche incomplète : « 1 donnée manquante », « 2 données
 * manquantes » — ou `null` si rien ne manque. Le détail est sur la fiche.
 */
export function gapsBadgeLabel(vehicle: VehicleView): string | null {
  const count = vehicle.gaps.length;
  if (count === 0) return null;
  return count === 1 ? '1 donnée manquante' : `${String(count)} données manquantes`;
}

/** « 1 véhicule actif », « 3 véhicules actifs » — le nombre EST la liste. */
export function activeCountLabel(count: number): string {
  return count === 1 ? '1 véhicule actif' : `${String(count)} véhicules actifs`;
}

/** L'adresse d'un point, sur une ligne : « 12 rue X, 75011 Paris ». */
export function pointAddressLine(point: DeparturePointView): string {
  const { ligne1, ligne2, codePostal, ville } = point.address;
  return [ligne1, ligne2, `${codePostal} ${ville}`.trim()]
    .filter((part) => part.trim() !== '')
    .join(', ');
}
