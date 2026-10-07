import { computed, inject, Injectable, signal } from '@angular/core';
import type { DeliveryRoundProposalView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import {
  applyPayloadOfPlan,
  type PlannedRound,
  type PlannedStop,
  planOf,
  planSummary,
  planWithLists,
  sheetsOf,
  timingPayloadOf,
  withTimings,
} from './delivery-planning';
import type { ComposedDay, OrderLists } from './delivery-rounds';
import { DeliveryRoutingService } from './delivery-routing.service';
import { type Board, POOL_KEY } from './rounds-board-model';
import { boardOfPlan, previewPoolOf } from './rounds-board-preview';

/** Ce qu'« Annuler » remet dans l'aperçu : la composition et « À répartir » d'avant. */
export interface PreviewSnapshot {
  readonly plan: readonly PlannedRound[];
  readonly pool: readonly string[];
}

/**
 * **L'aperçu d'une proposition dans le tableau** (`handoff-tournees/SPEC.md`,
 * § 6) — repris du calculateur (`plan-preparation-de-tournee.md`, lots 7 et
 * 10 bis), sans sa carte à part.
 *
 * Rien n'est écrit tant qu'on n'applique pas (L7-C6) : glisser recompose
 * LOCALEMENT, puis les colonnes touchées partent au chronométrage — une
 * lecture (L10b-C2), que le serveur peut refuser (L10b-C5). « Appliquer »
 * envoie la composition ÉDITÉE, avec les versions lues.
 *
 * Fourni par la page, pas à la racine : un aperçu appartient à un écran.
 */
@Injectable()
export class RoundsPreview {
  private readonly routing = inject(DeliveryRoutingService);

  readonly proposal = signal<DeliveryRoundProposalView | null>(null);
  private readonly composed = signal<ComposedDay | null>(null);
  private readonly plan = signal<readonly PlannedRound[]>([]);
  private readonly pool = signal<readonly string[]>([]);
  /** Le dernier refus de « chronométrer » : la composition reste, sans heures. */
  readonly timingRefusal = signal<string | null>(null);
  /** Les colonnes en cours de chronométrage, et combien d'appels chacune attend. */
  private readonly inflight = signal<ReadonlyMap<string, number>>(new Map());

  readonly active = computed(() => this.proposal() !== null);
  readonly timing = computed(() => this.inflight().size > 0);
  readonly summary = computed(() => planSummary(this.plan()));
  /** « Tout recomposé », ou le mode appliqué par le serveur. */
  readonly recomposed = signal(false);

  readonly board = computed<Board | null>(() => {
    const proposal = this.proposal();
    return proposal === null
      ? null
      : boardOfPlan(this.plan(), this.pool(), this.composed(), proposal);
  });

  /** Ce qu'« Appliquer » enverrait — vide : rien à appliquer. */
  readonly applyPayload = computed(() => {
    const proposal = this.proposal();
    return proposal === null ? null : applyPayloadOfPlan(proposal, this.plan());
  });

  /** Une proposition neuve : la composition éditée repart d'elle. */
  show(
    proposal: DeliveryRoundProposalView,
    composed: ComposedDay | null,
    recomposed: boolean,
  ): void {
    const plan = planOf(proposal, composed);
    this.proposal.set(proposal);
    this.composed.set(composed);
    this.recomposed.set(recomposed);
    this.plan.set(plan);
    this.pool.set(previewPoolOf(plan, composed, proposal));
    this.timingRefusal.set(null);
    // Les tournées gardées n'ont pas d'heures : un seul appel les chronomètre
    // toutes, pour qu'une tournée qui arrivera en retard le dise.
    const kept = plan
      .filter((round) => round.kept && round.vehicleId !== '')
      .map((round) => round.key);
    if (kept.length > 0) {
      void this.retime(kept);
    }
  }

  discard(): void {
    this.proposal.set(null);
    this.composed.set(null);
    this.plan.set([]);
    this.pool.set([]);
    this.timingRefusal.set(null);
    this.inflight.set(new Map());
  }

  snapshot(): PreviewSnapshot {
    return { plan: this.plan(), pool: this.pool() };
  }

  restore(snapshot: PreviewSnapshot): void {
    this.plan.set(snapshot.plan);
    this.pool.set(snapshot.pool);
  }

  /**
   * Un geste dans l'aperçu : les listes nommées prennent ces commandes, puis
   * les colonnes touchées partent au chronométrage. `false` : refusé (une
   * tournée partie ou chargée, I6) — rien n'a changé.
   */
  relayout(lists: OrderLists): boolean {
    const roundLists = Object.fromEntries(
      Object.entries(lists).filter(([key]) => key !== POOL_KEY),
    );
    const next = planWithLists(this.plan(), roundLists, this.stopsByOrder());
    if (next === null) {
      return false;
    }
    this.plan.set(next);
    const pool = lists[POOL_KEY];
    if (pool !== undefined) {
      this.pool.set(pool);
    }
    void this.retime(Object.keys(roundLists));
    return true;
  }

  /** Applique la composition éditée ; un refus remonte tel quel à la page. */
  async apply(): Promise<void> {
    const payload = this.applyPayload();
    if (payload === null) {
      return;
    }
    await this.routing.apply(payload);
    this.discard();
  }

  /** Tout arrêt que l'aperçu peut placer : ceux des colonnes, puis ceux du jour. */
  private stopsByOrder(): ReadonlyMap<string, PlannedStop> {
    const stops = new Map<string, PlannedStop>();
    const proposal = this.proposal();
    const sheets = sheetsOf(this.composed());
    const refs = [
      ...(this.composed()?.unassigned.map(({ order }) => order) ?? []),
      ...(this.composed()?.rounds.flatMap((round) => round.stops.map(({ stop }) => stop)) ?? []),
      ...(proposal?.unlocated ?? []),
      ...(proposal?.overflow ?? []),
      ...(proposal?.unfit ?? []),
    ];
    for (const ref of refs) {
      const sheet = sheets.get(ref.orderId) ?? null;
      stops.set(ref.orderId, {
        orderId: ref.orderId,
        reference: ref.reference,
        arrival: null,
        window: sheet?.window ?? null,
        windowMissed: false,
        sheet,
      });
    }
    for (const round of this.plan()) {
      for (const stop of round.stops) {
        stops.set(stop.orderId, stop);
      }
    }
    return stops;
  }

  private async retime(keys: readonly string[]): Promise<void> {
    const proposal = this.proposal();
    const payload = proposal === null ? null : timingPayloadOf(proposal.day, this.plan(), keys);
    if (payload === null) {
      return;
    }
    this.track(keys, 1);
    this.timingRefusal.set(null);
    try {
      const view = await this.routing.time(payload);
      // Une autre proposition entre-temps : ces heures ne la concernent pas.
      if (proposal === this.proposal()) {
        this.plan.update((plan) => withTimings(plan, payload, view));
      }
    } catch (error) {
      if (proposal === this.proposal()) {
        this.timingRefusal.set(
          httpErrorMessage(error, 'Les nouvelles heures n’ont pas pu être calculées.'),
        );
      }
    } finally {
      this.track(keys, -1);
    }
  }

  private track(keys: readonly string[], delta: 1 | -1): void {
    const next = new Map(this.inflight());
    for (const key of keys) {
      const count = (next.get(key) ?? 0) + delta;
      if (count > 0) {
        next.set(key, count);
      } else {
        next.delete(key);
      }
    }
    this.inflight.set(next);
  }
}
