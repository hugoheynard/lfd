import type { WorkshopLine } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { type WorkshopRowSources, workshopRows } from './workshop-rows';

function line(sku: string): WorkshopLine {
  return {
    sku,
    productName: sku,
    quantity: 10,
    saleUnit: 'piece',
    containerLabel: null,
    done: false,
    initials: null,
    doneAt: null,
    produced: 0,
    remaining: 10,
    surplus: 0,
    batches: [],
    container: null,
    deadlines: [],
  };
}

const SOURCES: WorkshopRowSources = {
  intertitles: new Map([['CRO', 'Viennoiseries']]),
  isBusy: (value) => value.sku === 'PAIN',
  pendingOf: (sku) => (sku === 'CRO' ? { quantity: 30, state: 'queued' } : null),
  doneWaiting: (sku) => sku === 'PAIN',
  shortcuts: new Map([['CRO', [{ id: 'bs-1', label: '1 plaque', pieces: 30 }]]]),
  linkedSku: 'PAIN',
  stationNames: new Map([['ws_b', 'Boulangerie']]),
};

describe('les rangées de la vue produit', () => {
  it('rassemble ce que l’écran sait de chaque ligne, dans l’ordre servi', () => {
    const [cro, pain] = workshopRows([line('CRO'), line('PAIN')], SOURCES);

    expect(cro).toMatchObject({
      intertitle: 'Viennoiseries',
      busy: false,
      pending: { quantity: 30, state: 'queued' },
      doneWaiting: false,
      linked: false,
    });
    expect(cro?.shortcuts).toHaveLength(1);
    expect(pain).toMatchObject({
      intertitle: null,
      busy: true,
      pending: null,
      doneWaiting: true,
      shortcuts: [],
      linked: true,
      stepsWaiting: null,
    });
  });

  it('nomme les étapes qui attendent sur la ligne', () => {
    const [sandwich] = workshopRows([{ ...line('SAN'), stepsPending: ['ws_b'] }], SOURCES);

    expect(sandwich?.stepsWaiting).toBe('En attente de : Boulangerie');
  });
});
