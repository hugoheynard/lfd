import type { DeliveryRoundProposalView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  applyPayloadOf,
  detourFactorOf,
  detourLabel,
  detourPercentOf,
  distanceLabel,
  durationLabel,
  estimateLabel,
  keptReasonLabel,
  MODE_OPTIONS,
  modeLabel,
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
  defaultMode: 'insert' as const,
  multiplePassages: true,
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
    expect(detourLabel(140)).toBe('×1,4');
    expect(detourLabel(135)).toBe('×1,35');
  });

  it('compare deux réglages champ par champ', () => {
    expect(sameSettings(SETTINGS, { ...SETTINGS })).toBe(true);
    expect(sameSettings(SETTINGS, { ...SETTINGS, stopMinutes: 6 })).toBe(false);
    expect(sameSettings(SETTINGS, { ...SETTINGS, defaultMode: 'new_rounds' })).toBe(false);
    expect(sameSettings(SETTINGS, { ...SETTINGS, multiplePassages: false })).toBe(false);
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
      kept: [],
      versions: [],
    });

    expect(estimateLabel(proposal('road'))).toMatch(/^Durées par la route/);
    expect(estimateLabel(proposal('road'))).not.toMatch(/vol d’oiseau/);
    expect(estimateLabel(proposal('crow_flies'))).toMatch(
      /^Estimation à vol d’oiseau \(×1,4, 35 km\/h\) — le calcul routier ne répond pas/,
    );
  });

  it('nomme chaque raison, en français', () => {
    expect(unlocatedReasonLabel('not_geocoded')).toBe('Adresse pas encore située');
    expect(keptReasonLabel('loaded')).toBe('Un sac y est chargé');
    expect(keptReasonLabel('unchanged')).toBe('Rien à y insérer');
    expect(modeLabel('new_rounds')).toBe('Nouvelles tournées');
    expect(MODE_OPTIONS.map((option) => option.value)).toEqual(['insert', 'new_rounds']);
  });

  it('renvoie la proposition telle qu’on l’a vue, avec TOUTES les versions lues', () => {
    const proposal: DeliveryRoundProposalView = {
      day: '2026-10-01',
      estimate: 'crow_flies',
      mode: 'new_rounds',
      departurePoint: { pickupAddressId: 'p-1', label: 'Labo', gps: { lat: 45.5, lng: 6.4 } },
      settings: { ...SETTINGS, source: 'default' },
      rounds: [
        {
          roundId: 'r-1',
          vehicleId: 'v-1',
          vehicleName: 'Kangoo',
          passage: 1,
          departureTime: '07:00',
          returnTime: '09:10',
          meters: 42_000,
          minutes: 130,
          overDuration: false,
          stops: [
            {
              orderId: 'o-2',
              reference: 'CMD-2',
              arrival: '07:20',
              window: null,
              windowMissed: false,
            },
            {
              orderId: 'o-1',
              reference: 'CMD-1',
              arrival: '07:40',
              window: null,
              windowMissed: false,
            },
          ],
        },
        {
          roundId: null,
          vehicleId: 'v-2',
          vehicleName: 'Trafic',
          passage: 1,
          departureTime: '07:00',
          returnTime: '08:00',
          meters: 10_000,
          minutes: 60,
          overDuration: false,
          stops: [],
        },
      ],
      unlocated: [],
      overflow: [],
      kept: [],
      versions: [
        { roundId: 'r-1', version: 4 },
        { roundId: 'r-9', version: 2 },
      ],
    };
    expect(applyPayloadOf(proposal)).toEqual({
      day: '2026-10-01',
      rounds: [
        { roundId: 'r-1', vehicleId: 'v-1', orderIds: ['o-2', 'o-1'] },
        { roundId: null, vehicleId: 'v-2', orderIds: [] },
      ],
      versions: [
        { roundId: 'r-1', version: 4 },
        { roundId: 'r-9', version: 2 },
      ],
    });
  });
});
