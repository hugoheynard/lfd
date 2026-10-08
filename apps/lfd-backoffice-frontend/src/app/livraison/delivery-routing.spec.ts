import type { BinTypeView, DeliveryRoundProposalView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  defaultContainerOptions,
  defaultDemandLabel,
  detourFactorOf,
  detourPercentOf,
  distanceLabel,
  durationLabel,
  estimateLabel,
  MODE_OPTIONS,
  modeLabel,
  NO_DEFAULT_CONTAINER,
  proposalWindowLabel,
  sameSettings,
  unlocatedReasonLabel,
} from './delivery-routing';

const SETTINGS = {
  detourPercent: 140,
  averageSpeedKmh: 35,
  earliestDeparture: '07:00',
  maxRoundMinutes: 240,
  stopMinutes: 5,
  safetyMarginMinutes: 20,
  defaultMode: 'insert' as const,
  multiplePassages: true,
  defaultContainer: null,
  binGapCm: 1,
};

describe('le calculateur de tournée — dérivations pures', () => {
  it('met une durée en minutes, puis en heures', () => {
    expect(durationLabel(0)).toBe('0 min');
    expect(durationLabel(45)).toBe('45 min');
    expect(durationLabel(60)).toBe('1 h');
    expect(durationLabel(65)).toBe('1 h 05');
    expect(durationLabel(154.6)).toBe('2 h 35');
  });

  it('met une distance en kilomètres au dixième, en français', () => {
    expect(distanceLabel(12_340)).toBe('12,3 km');
    expect(distanceLabel(0)).toBe('0,0 km');
  });

  it('dit la fenêtre d’un arrêt proposé', () => {
    expect(proposalWindowLabel({ start: '08:00', end: '10:30' })).toBe('fenêtre 8 h 00 – 10 h 30');
    expect(proposalWindowLabel({ start: null, end: '10:00' })).toBe('fenêtre avant 10 h 00');
  });

  it('lit le détour en facteur et le rend en centièmes, sans dérive flottante', () => {
    expect(detourFactorOf(140)).toBe(1.4);
    expect(detourPercentOf(1.4)).toBe(140);
    expect(detourPercentOf(1.15)).toBe(115);
  });

  it('compare deux réglages champ par champ', () => {
    expect(sameSettings(SETTINGS, { ...SETTINGS })).toBe(true);
    expect(sameSettings(SETTINGS, { ...SETTINGS, stopMinutes: 6 })).toBe(false);
    expect(sameSettings(SETTINGS, { ...SETTINGS, safetyMarginMinutes: 30 })).toBe(false);
    expect(sameSettings(SETTINGS, { ...SETTINGS, defaultMode: 'new_rounds' })).toBe(false);
    expect(sameSettings(SETTINGS, { ...SETTINGS, multiplePassages: false })).toBe(false);
    const manne = { binTypeId: 'manne', count: 1 };
    expect(sameSettings(SETTINGS, { ...SETTINGS, defaultContainer: manne })).toBe(false);
    expect(
      sameSettings(
        { ...SETTINGS, defaultContainer: manne },
        { ...SETTINGS, defaultContainer: { ...manne, count: 2 } },
      ),
    ).toBe(false);
    expect(
      sameSettings(
        { ...SETTINGS, defaultContainer: manne },
        { ...SETTINGS, defaultContainer: { ...manne } },
      ),
    ).toBe(true);
  });

  it('dit d’où viennent les durées : la route, ou le vol d’oiseau et pourquoi', () => {
    const proposal = (
      estimate: DeliveryRoundProposalView['estimate'],
    ): DeliveryRoundProposalView => ({
      day: '2026-10-01',
      estimate,
      mode: 'new_rounds',
      departurePoint: { pickupAddressId: 'p-1', label: 'Labo', gps: { lat: 45.5, lng: 6.4 } },
      settings: { ...SETTINGS, source: 'default' },
      rounds: [],
      unlocated: [],
      overflow: [],
      unfit: [],
      unknownDemand: [],
      defaultDemand: [],
      kept: [],
      versions: [],
    });

    expect(estimateLabel(proposal('road'))).toMatch(/^Durées par la route/);
    expect(estimateLabel(proposal('road'))).not.toMatch(/vol d’oiseau/);
    expect(estimateLabel(proposal('crow_flies'))).toMatch(
      /^Estimation à vol d’oiseau — le calcul routier ne répond pas/,
    );
  });

  it('nomme chaque raison, en français', () => {
    expect(unlocatedReasonLabel('not_geocoded')).toBe('Adresse pas encore située');
    expect(modeLabel('new_rounds')).toBe('Nouvelles tournées');
    expect(MODE_OPTIONS.map((option) => option.value)).toEqual(['insert', 'new_rounds']);
  });

  describe('le contenant par défaut d’une commande (2026-10-06)', () => {
    const type = (id: string, archived: boolean): BinTypeView => ({
      id,
      name: id === 'manne' ? 'Manne' : 'Bac M',
      outer: { lengthMm: 600, widthMm: 400, heightMm: 220 },
      inner: { lengthMm: 560, widthMm: 360, heightMm: 200 },
      innerVolumeLiters: 40,
      isotherm: false,
      maxStack: 5,
      divisible: true,
      archivedAt: archived ? '2026-01-01T00:00:00.000Z' : null,
    });

    it('propose « Aucun », puis les types en service', () => {
      expect(defaultContainerOptions([type('manne', false), type('bac_m', true)], null)).toEqual([
        { value: NO_DEFAULT_CONTAINER, label: 'Aucun — place non vérifiée' },
        { value: 'manne', label: 'Manne' },
      ]);
    });

    it('dit « par défaut » sur l’arrêt, et la part estimée quand il y en a une', () => {
      expect(defaultDemandLabel({ binTypeName: 'Manne', count: 1, withEstimate: false })).toBe(
        '1 × Manne (par défaut)',
      );
      expect(defaultDemandLabel({ binTypeName: 'Manne', count: 2, withEstimate: true })).toBe(
        'Estimée + 2 × Manne (par défaut)',
      );
    });
  });
});
