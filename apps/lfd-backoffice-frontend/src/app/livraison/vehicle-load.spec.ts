import { describe, expect, it } from 'vitest';

import {
  cargoLabel,
  cargoVolumeLiters,
  coldLabel,
  draftVolumeLiters,
  loadDraftOf,
  readLoad,
  temperatureLabel,
  ENERGY_OPTIONS,
  energyBadgeLabel,
  energyLabel,
  vehicleBadgeLabel,
  vehicleLoadLine,
  volumeLabel,
  type VehicleLoadDraft,
  wheelArchesLabel,
} from './vehicle-load';

const EMPTY: VehicleLoadDraft = {
  lengthCm: null,
  widthCm: null,
  heightCm: null,
  refrigerated: false,
  coldLiters: null,
  minTempC: null,
  maxTempC: null,
  arches: false,
  archLengthCm: null,
  archProtrusionCm: null,
  archFromBackCm: null,
  archHeightCm: null,
};

const TRAFIC: VehicleLoadDraft = { ...EMPTY, lengthCm: 250, widthCm: 170, heightCm: 130 };
const COLD: VehicleLoadDraft = {
  ...TRAFIC,
  refrigerated: true,
  coldLiters: 400,
  minTempC: 0,
  maxTempC: 4,
};

function issueOf(draft: VehicleLoadDraft): string {
  const reading = readLoad(draft);
  return reading.ok ? '' : reading.issue;
}

describe('volume utile', () => {
  it('se dérive comme le serveur : L × l × h / 1 000, arrondi en dessous', () => {
    expect(cargoVolumeLiters(250, 170, 130)).toBe(5525);
    expect(cargoVolumeLiters(11, 11, 11)).toBe(1); // 1,331 L
  });

  it('attend les trois dimensions', () => {
    expect(draftVolumeLiters({ ...TRAFIC, heightCm: null })).toBeNull();
    expect(draftVolumeLiters(TRAFIC)).toBe(5525);
  });

  it('se lit en m³, une décimale à la française', () => {
    expect(volumeLabel(3300)).toBe('3,3 m³');
    expect(volumeLabel(5525)).toBe('5,5 m³');
    expect(volumeLabel(6000)).toBe('6 m³');
  });
});

describe('libellés', () => {
  it('signe les températures', () => {
    expect(temperatureLabel(4)).toBe('+4');
    expect(temperatureLabel(0)).toBe('0');
    expect(temperatureLabel(-18)).toBe('−18');
  });

  it('dit la caisse réfrigérée, ou « Sec »', () => {
    expect(coldLabel({ volumeLiters: 400, minTempC: 0, maxTempC: 4 })).toBe('❄ 400 L · 0 à +4 °C');
    expect(coldLabel({ volumeLiters: 1200, minTempC: -20, maxTempC: -18 })).toBe(
      '❄ 1\u202f200 L · −20 à −18 °C', // espace fine insécable d’Intl,
    );
    expect(coldLabel(null)).toBe('Sec');
  });

  it('dit les dimensions et le volume', () => {
    expect(cargoLabel({ lengthCm: 250, widthCm: 170, heightCm: 130, volumeLiters: 5525 })).toBe(
      '250 × 170 × 130 cm · 5,5 m³',
    );
  });

  it('le badge : volume, flocon, les deux — rien si rien n’est connu', () => {
    const cargo = { lengthCm: 250, widthCm: 170, heightCm: 130, volumeLiters: 5525 };
    const cold = { volumeLiters: 400, minTempC: 0, maxTempC: 4 };
    const none = { energy: null };
    expect(vehicleBadgeLabel({ cargo, refrigeration: null, ...none })).toBe('5,5 m³');
    expect(vehicleBadgeLabel({ cargo, refrigeration: cold, ...none })).toBe('5,5 m³ ❄');
    expect(vehicleBadgeLabel({ cargo: null, refrigeration: cold, ...none })).toBe('❄');
    expect(vehicleBadgeLabel({ cargo: null, refrigeration: null, ...none })).toBeNull();
  });

  it('le badge dit l’électrique et l’hybride, jamais le thermique', () => {
    const cargo = { lengthCm: 250, widthCm: 170, heightCm: 130, volumeLiters: 5525 };
    expect(vehicleBadgeLabel({ cargo, refrigeration: null, energy: 'electric' })).toBe(
      '5,5 m³ Élec.',
    );
    expect(vehicleBadgeLabel({ cargo: null, refrigeration: null, energy: 'hybrid' })).toBe(
      'Hybride',
    );
    for (const energy of ['diesel', 'petrol', 'gas'] as const) {
      expect(vehicleBadgeLabel({ cargo: null, refrigeration: null, energy })).toBeNull();
    }
  });
});

describe('énergie', () => {
  it('nomme chaque énergie, et rien quand elle n’est pas renseignée', () => {
    expect(energyLabel('electric')).toBe('Électrique');
    expect(energyLabel('hybrid')).toBe('Hybride');
    expect(energyLabel('diesel')).toBe('Diesel');
    expect(energyLabel('petrol')).toBe('Essence');
    expect(energyLabel('gas')).toBe('Gaz (GNV/GPL)');
    expect(energyLabel(null)).toBeNull();
  });

  it('propose les cinq énergies du contrat, dans son ordre', () => {
    expect(ENERGY_OPTIONS.map((option) => option.label)).toEqual([
      'Électrique',
      'Hybride',
      'Diesel',
      'Essence',
      'Gaz (GNV/GPL)',
    ]);
  });

  it('le mot court ne vaut que pour l’électrique et l’hybride', () => {
    expect(energyBadgeLabel('electric')).toBe('Élec.');
    expect(energyBadgeLabel('hybrid')).toBe('Hybride');
    expect(energyBadgeLabel('diesel')).toBeNull();
    expect(energyBadgeLabel(null)).toBeNull();
  });
});

describe('vehicleLoadLine', () => {
  it('dimensions puis froid ; rien des dimensions si elles sont inconnues', () => {
    const cargo = { lengthCm: 250, widthCm: 170, heightCm: 130, volumeLiters: 5525 };
    expect(vehicleLoadLine({ cargo, refrigeration: null })).toBe(
      '250 × 170 × 130 cm · 5,5 m³ · Sec',
    );
    expect(
      vehicleLoadLine({
        cargo: null,
        refrigeration: { volumeLiters: 400, minTempC: 0, maxTempC: 4 },
      }),
    ).toBe('❄ 400 L · 0 à +4 °C');
  });
});

describe('readLoad', () => {
  it('rien de saisi : ni dimensions, ni froid', () => {
    expect(readLoad(EMPTY)).toEqual({
      ok: true,
      cargo: null,
      wheelArches: null,
      refrigeration: null,
    });
  });

  it('les trois dimensions ou aucune', () => {
    expect(issueOf({ ...EMPTY, lengthCm: 250 })).toContain('les trois, ou aucune');
    expect(readLoad(TRAFIC)).toEqual({
      ok: true,
      cargo: { lengthCm: 250, widthCm: 170, heightCm: 130 },
      wheelArches: null,
      refrigeration: null,
    });
  });

  it('les passages de roue : les quatre cotes ou aucune, et jamais sans espace utile', () => {
    const arches = {
      arches: true,
      archLengthCm: 90,
      archProtrusionCm: 20,
      archFromBackCm: 60,
      archHeightCm: 30,
    };
    expect(issueOf({ ...TRAFIC, ...arches, archHeightCm: null })).toContain('les quatre');
    expect(readLoad({ ...TRAFIC, ...arches })).toMatchObject({
      ok: true,
      wheelArches: { lengthCm: 90, protrusionCm: 20, fromBackCm: 60, heightCm: 30 },
    });
    expect(readLoad({ ...EMPTY, ...arches })).toMatchObject({ ok: true, wheelArches: null });
    expect(readLoad({ ...TRAFIC, ...arches, arches: false })).toMatchObject({
      ok: true,
      wheelArches: null,
    });
  });

  it('dit les passages de roue en une ligne', () => {
    expect(wheelArchesLabel({ lengthCm: 90, protrusionCm: 20, fromBackCm: 60, heightCm: 30 })).toBe(
      'Passages de roue : 90 cm de long, 20 cm par côté, à 60 cm du fond, 30 cm de haut',
    );
  });

  it('refuse une dimension hors de 1 à 1 000 cm, ou non entière', () => {
    expect(issueOf({ ...TRAFIC, lengthCm: 0 })).toContain('de 1 à 1000');
    expect(issueOf({ ...TRAFIC, lengthCm: 1001 })).toContain('centimètres');
    expect(issueOf({ ...TRAFIC, lengthCm: 250.5 })).toContain('entier');
  });

  it('une caisse réfrigérée complète part avec, températures négatives permises', () => {
    expect(readLoad({ ...COLD, minTempC: -20, maxTempC: -18 })).toEqual({
      ok: true,
      cargo: { lengthCm: 250, widthCm: 170, heightCm: 130 },
      wheelArches: null,
      refrigeration: { volumeLiters: 400, minTempC: -20, maxTempC: -18 },
    });
  });

  it('case décochée : les champs restés remplis ne partent pas', () => {
    const reading = readLoad({ ...COLD, refrigerated: false, minTempC: 99 });
    expect(reading).toMatchObject({ ok: true, refrigeration: null });
  });

  it('refuse min > max', () => {
    expect(issueOf({ ...COLD, minTempC: 6, maxTempC: 4 })).toBe(
      'La température minimale ne peut pas dépasser la maximale.',
    );
  });

  it('refuse une température hors de −30 à +15 °C', () => {
    expect(issueOf({ ...COLD, minTempC: -31 })).toContain('de −30 à +15 °C');
    expect(issueOf({ ...COLD, maxTempC: 16 })).toContain('de −30 à +15 °C');
  });

  it('refuse un volume réfrigéré au-delà du volume utile', () => {
    expect(issueOf({ ...COLD, coldLiters: 6000 })).toBe(
      'Le volume réfrigéré (6\u202f000 L) dépasse le volume utile (5\u202f525 L).',
    );
  });

  it('sans dimensions, le volume réfrigéré n’est borné que par 20 000 L', () => {
    expect(readLoad({ ...COLD, lengthCm: null, widthCm: null, heightCm: null })).toMatchObject({
      ok: true,
      cargo: null,
    });
    expect(
      issueOf({ ...EMPTY, refrigerated: true, coldLiters: 20001, minTempC: 0, maxTempC: 4 }),
    ).toContain('20000');
  });

  it('exige le volume et les deux températures', () => {
    expect(issueOf({ ...COLD, coldLiters: null })).toBe('Saisissez le volume réfrigéré.');
    expect(issueOf({ ...COLD, maxTempC: null })).toContain('température maximale');
  });
});

describe('loadDraftOf', () => {
  it('part du véhicule, ou d’une saisie vide', () => {
    expect(loadDraftOf(undefined)).toEqual(EMPTY);
    expect(
      loadDraftOf({
        id: 'v',
        name: 'Trafic',
        plate: 'AB-123-CD',
        retiredAt: null,
        createdAt: '2026-01-01T08:00:00.000Z',
        cargo: { lengthCm: 250, widthCm: 170, heightCm: 130, volumeLiters: 5525 },
        wheelArches: null,
        refrigeration: { volumeLiters: 400, minTempC: 0, maxTempC: 4 },
        energy: null,
      }),
    ).toEqual(COLD);
  });
});

/** Régression : un véhicule jamais renseigné s'affichait « Sec », un fait inventé (2026-09-29). */
describe('vehicleLoadLine', () => {
  it("ne dit rien d'un véhicule jamais renseigné", () => {
    expect(vehicleLoadLine({ cargo: null, refrigeration: null })).toBeNull();
  });

  it('dit « Sec » quand le chargement est renseigné sans froid', () => {
    const cargo = { lengthCm: 200, widthCm: 150, heightCm: 110, volumeLiters: 3300 };
    expect(vehicleLoadLine({ cargo, refrigeration: null })).toBe(
      '200 × 150 × 110 cm · 3,3 m³ · Sec',
    );
  });
});
