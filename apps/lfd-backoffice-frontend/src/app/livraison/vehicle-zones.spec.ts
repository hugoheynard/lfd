import type { DeliveryZoneView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { REMOVED_ZONE_LABEL, sameZones, zoneOptionsOf, zonesLine } from './vehicle-zones';

const zone = (id: string, label: string, prefixes: readonly string[]): DeliveryZoneView => ({
  id,
  label,
  postalPrefixes: prefixes,
  fee: { mode: 'amount', cents: 0 },
});

const ZONES = [zone('z_aix', 'Aix', ['731']), zone('z_sud', ' ', ['738', '739'])];

describe('les zones autorisées d’un véhicule, à l’écran', () => {
  it('nomme une zone par son libellé, sinon par ses préfixes', () => {
    expect(zoneOptionsOf(ZONES, [])).toEqual([
      { value: 'z_aix', label: 'Aix' },
      { value: 'z_sud', label: '738, 739' },
    ]);
  });

  it('garde une zone choisie qui n’existe plus, pour qu’on puisse la retirer', () => {
    expect(zoneOptionsOf(ZONES, ['z_aix', 'z_vieille']).at(-1)).toEqual({
      value: 'z_vieille',
      label: REMOVED_ZONE_LABEL,
    });
  });

  it('ne dit rien d’un véhicule qui va partout', () => {
    expect(zonesLine([], ZONES)).toBeNull();
    expect(zonesLine([], null)).toBeNull();
  });

  it('nomme les zones d’un véhicule restreint, et compte sans nommer faute de liste', () => {
    expect(zonesLine(['z_aix', 'z_vieille'], ZONES)).toBe(`Zones : Aix, ${REMOVED_ZONE_LABEL}`);
    expect(zonesLine(['z_aix'], null)).toBe('Restreint à 1 zone');
    expect(zonesLine(['z_aix', 'z_sud'], null)).toBe('Restreint à 2 zones');
  });

  it('deux listes égales à l’ordre et aux doublons près sont les mêmes zones', () => {
    expect(sameZones(['b', 'a'], ['a', 'b', 'a'])).toBe(true);
    expect(sameZones(['a'], ['a', 'b'])).toBe(false);
  });
});
