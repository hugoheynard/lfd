import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  READINESS_POLL_MS,
  READINESS_STALL_MS,
  READINESS_VEIL_DELAY_MS,
  RoadRoutingReadiness,
} from './road-routing-readiness';
import { RoadRoutingWake } from './road-routing-wake';

const URL_PART = '/admin/delivery/road-routing/readiness';
const wake = vi.fn();

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      RoadRoutingReadiness,
      { provide: RoadRoutingWake, useValue: { wake } },
    ],
  });
  return {
    readiness: TestBed.inject(RoadRoutingReadiness),
    http: TestBed.inject(HttpTestingController),
  };
}

function answer(http: HttpTestingController, ready: boolean): void {
  http.expectOne((req) => req.url.endsWith(URL_PART)).flush({ ready });
}

describe('RoadRoutingReadiness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    wake.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('réveille, sonde, et passe de warming à ready', async () => {
    const { readiness, http } = setup();
    readiness.start();
    expect(wake).toHaveBeenCalledTimes(1);
    answer(http, false);
    await vi.advanceTimersByTimeAsync(READINESS_VEIL_DELAY_MS);
    expect(readiness.state()).toBe('warming');
    expect(readiness.veiled()).toBe(true);
    await vi.advanceTimersByTimeAsync(READINESS_POLL_MS);
    answer(http, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(readiness.state()).toBe('ready');
    expect(readiness.veiled()).toBe(false);
    await vi.advanceTimersByTimeAsync(READINESS_POLL_MS * 3);
    http.expectNone((req) => req.url.endsWith(URL_PART));
  });

  it('prêt dès la première réponse : aucun voile', async () => {
    const { readiness, http } = setup();
    readiness.start();
    answer(http, true);
    await vi.advanceTimersByTimeAsync(READINESS_VEIL_DELAY_MS * 2);
    expect(readiness.veiled()).toBe(false);
  });

  it('une erreur de la sonde compte comme « pas prêt » et l’on continue', async () => {
    const { readiness, http } = setup();
    readiness.start();
    http
      .expectOne((req) => req.url.endsWith(URL_PART))
      .flush('down', { status: 503, statusText: 'Unavailable' });
    await vi.advanceTimersByTimeAsync(READINESS_POLL_MS);
    expect(readiness.state()).toBe('warming');
    answer(http, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(readiness.state()).toBe('ready');
  });

  it('passe à stalled après le délai, et Réessayer repart', async () => {
    const { readiness, http } = setup();
    readiness.start();
    for (let elapsed = 0; elapsed < READINESS_STALL_MS; elapsed += READINESS_POLL_MS) {
      for (const req of http.match((r) => r.url.endsWith(URL_PART))) req.flush({ ready: false });
      await vi.advanceTimersByTimeAsync(READINESS_POLL_MS);
    }
    for (const req of http.match((r) => r.url.endsWith(URL_PART))) req.flush({ ready: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(readiness.state()).toBe('stalled');
    expect(readiness.veiled()).toBe(true);
    readiness.start();
    expect(wake).toHaveBeenCalledTimes(2);
    expect(readiness.state()).toBe('warming');
    answer(http, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(readiness.state()).toBe('ready');
  });

  it('Continuer sans attendre lève le voile', async () => {
    const { readiness, http } = setup();
    readiness.start();
    answer(http, false);
    await vi.advanceTimersByTimeAsync(READINESS_VEIL_DELAY_MS);
    readiness.dismiss();
    expect(readiness.veiled()).toBe(false);
  });

  it('cesse de sonder à la destruction', async () => {
    const { readiness, http } = setup();
    readiness.start();
    answer(http, false);
    await vi.advanceTimersByTimeAsync(0);
    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(READINESS_POLL_MS * 2);
    expect(http.match((req) => req.url.endsWith(URL_PART))).toHaveLength(0);
  });
});
