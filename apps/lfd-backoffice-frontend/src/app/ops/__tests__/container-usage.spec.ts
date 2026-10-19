import type { ContainerUsage } from '@lfd/ops-contract';
import { describe, expect, it } from 'vitest';

import { containerReading, withContainerUsage } from '../container-usage';
import type { Occupancy } from '../occupancy';

const GENERATED_AT = '2026-01-01T00:10:00.000Z';

function usage(overrides: Partial<ContainerUsage> = {}): ContainerUsage {
  return {
    cpuPercent: 31.6,
    memoryPercent: 12.2,
    measuredAt: '2026-01-01T00:07:00.000Z',
    instances: 1,
    instanceType: 'standard-1',
    windowMinutes: 5,
    ...overrides,
  };
}

const LATENCY_40: Occupancy = { ratio: 0.4, tone: 'busy', basis: 'latence' };
const NOTHING: Occupancy = { ratio: 0, tone: 'calm', basis: 'aucune mesure' };

describe('containerReading', () => {
  it('arrondit et dit le délai de remontée depuis l’instant du constat', () => {
    const reading = containerReading(usage(), null, GENERATED_AT);

    expect(reading?.label).toBe('CPU 32 % · Mém. 12 %');
    expect(reading?.note).toContain('mesuré il y a 3 min');
    expect(reading?.sentence).toContain('standard-1');
    expect(reading?.missing).toBe(false);
  });

  it('nomme les instances quand il y en a plusieurs', () => {
    expect(containerReading(usage({ instances: 2 }), null, GENERATED_AT)?.sentence).toContain(
      '2 instances',
    );
  });

  it('dit chaque absence par son nom, et rend le geste en note', () => {
    const forbidden = containerReading(
      null,
      { reason: 'forbidden', detail: 'Ajoutez « Account Analytics: Read ».' },
      GENERATED_AT,
    );

    expect(forbidden?.label).toBe('CPU : jeton sans droit');
    expect(forbidden?.note).toBe('Ajoutez « Account Analytics: Read ».');
    expect(forbidden?.missing).toBe(true);
    expect(
      containerReading(null, { reason: 'no-samples', detail: 'rien' }, GENERATED_AT)?.label,
    ).toBe('CPU sans relevé');
  });

  it('ne dit rien quand le serveur n’a rien dit — une API d’avant ce contrat', () => {
    expect(containerReading(null, null, GENERATED_AT)).toBeNull();
  });
});

describe('withContainerUsage', () => {
  it('garde la pression quand elle est la pire', () => {
    expect(withContainerUsage(LATENCY_40, usage({ cpuPercent: 10, memoryPercent: 20 }))).toBe(
      LATENCY_40,
    );
  });

  it('prend le pire du CPU et de la mémoire quand il dépasse la pression', () => {
    expect(withContainerUsage(LATENCY_40, usage({ cpuPercent: 10, memoryPercent: 85 }))).toEqual({
      ratio: 0.85,
      tone: 'saturated',
      basis: 'conteneur',
    });
  });

  it('mesure le container même quand la gateway ne voit rien', () => {
    expect(withContainerUsage(NOTHING, usage({ cpuPercent: 0, memoryPercent: 0 }))).toEqual({
      ratio: 0,
      tone: 'calm',
      basis: 'conteneur',
    });
  });

  it('borne la couleur à 100 % sans toucher au chiffre affiché', () => {
    expect(withContainerUsage(NOTHING, usage({ cpuPercent: 150 })).ratio).toBe(1);
  });

  it('sans usage, rend la pression telle quelle', () => {
    expect(withContainerUsage(LATENCY_40, null)).toBe(LATENCY_40);
  });
});
