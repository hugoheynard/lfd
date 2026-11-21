import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GestureFeedback } from '../gesture-feedback';

const announced: { message: string; politeness: string | undefined }[] = [];

beforeEach(() => {
  announced.length = 0;
  TestBed.configureTestingModule({
    providers: [
      {
        provide: LiveAnnouncer,
        useValue: {
          announce: async (message: string, politeness?: string) => {
            announced.push({ message, politeness });
          },
        },
      },
    ],
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'vibrate');
  Reflect.deleteProperty(globalThis, 'AudioContext');
});

/** Un faux contexte audio : il note la fréquence de chaque bip joué. */
function installAudio(): number[] {
  const hz: number[] = [];
  class Recording {
    readonly currentTime = 0;
    readonly destination = {};
    createOscillator() {
      const frequency = { value: 0 };
      return {
        frequency,
        connect: (node: unknown) => node,
        start: () => {
          hz.push(frequency.value);
        },
        stop: () => undefined,
      };
    }
    createGain() {
      return { gain: { value: 0 }, connect: () => this.destination };
    }
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Recording });
  return hz;
}

describe('le retour d’un geste', () => {
  it('pris : une impulsion courte et une annonce polie', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });

    TestBed.inject(GestureFeedback).accepted('Fournée enregistrée');

    expect(vibrate).toHaveBeenCalledWith([30]);
    expect(announced).toEqual([{ message: 'Fournée enregistrée', politeness: 'polite' }]);
  });

  it('refusé : deux impulsions et une annonce immédiate', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });

    TestBed.inject(GestureFeedback).refused('Refusé');

    expect(vibrate).toHaveBeenCalledWith([80, 60, 80]);
    expect(announced[0]?.politeness).toBe('assertive');
  });

  it('sans vibreur, un bip aigu pour un geste pris, deux graves pour un refus', () => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
    const hz = installAudio();
    const feedback = TestBed.inject(GestureFeedback);

    feedback.accepted('Pris');
    expect(hz).toEqual([880]);

    feedback.refused('Refusé');
    expect(hz).toEqual([880, 220, 220]);
  });

  it('un appareil qui vibre ne bipe pas', () => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => true });
    const hz = installAudio();

    TestBed.inject(GestureFeedback).accepted('Pris');

    expect(hz).toEqual([]);
  });

  it('sans vibreur ni son, l’annonce part quand même', () => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });

    TestBed.inject(GestureFeedback).accepted('Pris');

    expect(announced).toHaveLength(1);
  });
});
