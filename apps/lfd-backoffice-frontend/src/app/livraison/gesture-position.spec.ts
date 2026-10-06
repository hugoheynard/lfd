import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import {
  appendPosition,
  GESTURE_POSITION_OPTIONS,
  GesturePositionReader,
} from './gesture-position';
import { fixedGeolocation, refusingGeolocation } from './gesture-position.fixture';

describe('GesturePositionReader — la position au geste (YA-D4)', () => {
  function reader(): GesturePositionReader {
    TestBed.resetTestingModule();
    return TestBed.inject(GesturePositionReader);
  }

  it('un relevé ponctuel, court, rendu dans les champs du contrat', async () => {
    const positions = reader();
    const phone = fixedGeolocation(45.46, 6.9, 12);
    positions.source = phone;

    await expect(positions.read()).resolves.toEqual({
      positionLat: 45.46,
      positionLng: 6.9,
      positionAccuracyM: 12,
    });
    expect(phone.calls).toEqual([GESTURE_POSITION_OPTIONS]);
    expect(positions.unavailable()).toBe(false);
  });

  it('refusée ou absente : `null`, et l’écran pourra dire « position indisponible »', async () => {
    const positions = reader();
    positions.source = refusingGeolocation();
    await expect(positions.read()).resolves.toBeNull();
    expect(positions.unavailable()).toBe(true);

    positions.source = null;
    await expect(positions.read()).resolves.toBeNull();
  });

  it('jamais `watchPosition` : le lecteur n’en connaît même pas l’existence', () => {
    expect(GesturePositionReader.prototype).not.toHaveProperty('watch');
    expect(GESTURE_POSITION_OPTIONS.timeout).toBeLessThanOrEqual(10_000);
  });

  it('ajoute les trois champs au multipart, et rien sans position', () => {
    const body = new FormData();
    appendPosition(body, null);
    expect([...body.keys()]).toEqual([]);

    appendPosition(body, { positionLat: 45.46, positionLng: 6.9, positionAccuracyM: 12 });
    expect(Object.fromEntries(body.entries())).toEqual({
      positionLat: '45.46',
      positionLng: '6.9',
      positionAccuracyM: '12',
    });
  });
});
