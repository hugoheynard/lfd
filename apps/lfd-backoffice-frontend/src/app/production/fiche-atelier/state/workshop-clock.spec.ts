import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkshopClock } from './workshop-clock';

/** Un instant de la journée du poste, à l'heure locale (l'horloge lit l'heure locale). */
function at(hours: number, minutes: number, seconds: number): Date {
  return new Date(2000, 0, 1, hours, minutes, seconds);
}

describe('l’horloge de la fiche', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lit l’heure du poste à la création, en secondes depuis minuit', () => {
    vi.setSystemTime(at(9, 12, 30));
    const clock = TestBed.runInInjectionContext(() => new WorkshopClock());

    expect(clock.seconds()).toBe(9 * 3600 + 12 * 60 + 30);
    expect(clock.minutes()).toBe(9 * 60 + 12);
  });

  it('vaut zéro à minuit pile', () => {
    vi.setSystemTime(at(0, 0, 0));
    const clock = TestBed.runInInjectionContext(() => new WorkshopClock());

    expect(clock.seconds()).toBe(0);
    expect(clock.minutes()).toBe(0);
  });

  it('avance chaque seconde, et les minutes seulement au passage de la minute', () => {
    vi.setSystemTime(at(9, 12, 58));
    const clock = TestBed.runInInjectionContext(() => new WorkshopClock());

    vi.advanceTimersByTime(1_000);
    expect(clock.seconds()).toBe(9 * 3600 + 12 * 60 + 59);
    expect(clock.minutes()).toBe(9 * 60 + 12);

    vi.advanceTimersByTime(1_000);
    expect(clock.seconds()).toBe(9 * 3600 + 13 * 60);
    expect(clock.minutes()).toBe(9 * 60 + 13);
  });

  it('cesse de tourner quand la fiche est détruite', () => {
    vi.setSystemTime(at(9, 0, 0));
    const clock = TestBed.runInInjectionContext(() => new WorkshopClock());

    TestBed.resetTestingModule();
    vi.advanceTimersByTime(5_000);

    expect(clock.seconds()).toBe(9 * 3600);
    expect(vi.getTimerCount()).toBe(0);
  });
});
