import type { DeliveryZoneView } from '@lfd/contracts';

/**
 * **Les zones autorisées d'un véhicule**, pour l'écran
 * (`documentation/livraisons/tournees/composition-automatique.md` §4, 2026-10-06).
 * Vide = partout. Les zones sont celles du commerce (Réglages → Zones de
 * livraison) : la flotte n'en invente pas d'autres.
 */

/** Ce qu'on dit d'une zone qui n'existe plus : elle n'autorise plus aucune commande. */
export const REMOVED_ZONE_LABEL = 'Zone supprimée';

/** Le nom d'une zone : son libellé, sinon ses préfixes de code postal. */
export function zoneLabel(zone: DeliveryZoneView): string {
  const label = zone.label.trim();
  return label === '' ? zone.postalPrefixes.join(', ') : label;
}

/**
 * Les choix du dialogue : toutes les zones, puis celles que le véhicule porte
 * encore mais qui n'existent plus — sans quoi on ne pourrait pas les retirer.
 */
export function zoneOptionsOf(
  zones: readonly DeliveryZoneView[],
  selected: readonly string[],
): readonly { readonly value: string; readonly label: string }[] {
  const known = new Set(zones.map((zone) => zone.id));
  return [
    ...zones.map((zone) => ({ value: zone.id, label: zoneLabel(zone) })),
    ...selected
      .filter((id) => !known.has(id))
      .map((id) => ({ value: id, label: REMOVED_ZONE_LABEL })),
  ];
}

/**
 * « Zones : Aix, Montmélian », ou `null` : il va partout, rien à dire. Sans
 * la liste des zones (`null`, lecture échouée), on compte sans nommer : dire
 * « supprimée » d'une zone qu'on n'a simplement pas pu lire serait faux.
 */
export function zonesLine(
  allowedZoneIds: readonly string[],
  zones: readonly DeliveryZoneView[] | null,
): string | null {
  if (allowedZoneIds.length === 0) {
    return null;
  }
  if (zones === null) {
    const count = allowedZoneIds.length;
    return `Restreint à ${String(count)} ${count === 1 ? 'zone' : 'zones'}`;
  }
  const byId = new Map(zones.map((zone) => [zone.id, zoneLabel(zone)]));
  const names = allowedZoneIds.map((id) => byId.get(id) ?? REMOVED_ZONE_LABEL);
  return `${allowedZoneIds.length === 1 ? 'Zone' : 'Zones'} : ${names.join(', ')}`;
}

/** Deux listes de zones disent-elles la même chose (ordre et doublons ignorés) ? */
export function sameZones(a: readonly string[], b: readonly string[]): boolean {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
