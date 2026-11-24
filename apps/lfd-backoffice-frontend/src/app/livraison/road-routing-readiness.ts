import { HttpClient } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import type { RoadRoutingReadinessView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { RoadRoutingWake } from './road-routing-wake';

const READINESS = `${B2B_API_BASE}/admin/delivery/road-routing/readiness`;

/** Entre deux sondes : le conteneur met des dizaines de secondes à charger sa carte. */
export const READINESS_POLL_MS = 3_000;
/** Au-delà, on cesse d'attendre et on le dit. */
export const READINESS_STALL_MS = 180_000;
/** Le voile n'apparaît qu'après ce délai sans réponse prête : pas de flash. */
export const READINESS_VEIL_DELAY_MS = 400;

export type RoadRoutingState = 'warming' | 'ready' | 'stalled';

/**
 * **Le calcul routier est-il prêt ?** — réveille le conteneur, puis le sonde
 * jusqu'à `ready: true` (décidé par Hugo le 2026-11-24 : Tour manager voile ses
 * tournées pendant ce temps, pour qu'on ne lance pas un « Proposer » qui
 * finirait en erreur).
 *
 * Fourni par la coquille de Tour manager : le sondage s'arrête avec elle. Une
 * sonde en erreur compte comme « pas prêt », et l'on continue.
 */
@Injectable()
export class RoadRoutingReadiness {
  private readonly http = inject(HttpClient);
  private readonly wakeUp = inject(RoadRoutingWake);

  readonly state = signal<RoadRoutingState>('warming');
  private readonly delayPassed = signal(false);
  private readonly dismissed = signal(false);
  /** Le voile se montre : pas encore prêt, le délai anti-flash passé, pas levé à la main. */
  readonly veiled = computed(
    () => this.delayPassed() && !this.dismissed() && this.state() !== 'ready',
  );

  private run = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** Réveille et sonde ; une relance repart de zéro. */
  start(): void {
    this.stop();
    const run = ++this.run;
    this.state.set('warming');
    this.dismissed.set(false);
    this.delayPassed.set(false);
    this.wakeUp.wake();
    this.later(() => this.delayPassed.set(true), READINESS_VEIL_DELAY_MS);
    this.later(() => {
      if (this.state() === 'warming') {
        this.state.set('stalled');
        this.stop();
      }
    }, READINESS_STALL_MS);
    void this.probe(run);
  }

  /** « Continuer sans attendre » : le voile se lève, la sonde aussi. */
  dismiss(): void {
    this.dismissed.set(true);
    this.stop();
  }

  private async probe(run: number): Promise<void> {
    const ready = await firstValueFrom(this.http.get<RoadRoutingReadinessView>(READINESS)).then(
      (view) => view.ready,
      () => false,
    );
    if (run !== this.run) return;
    if (ready) {
      this.state.set('ready');
      this.stop();
      return;
    }
    this.later(() => void this.probe(run), READINESS_POLL_MS);
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private stop(): void {
    this.run++;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
