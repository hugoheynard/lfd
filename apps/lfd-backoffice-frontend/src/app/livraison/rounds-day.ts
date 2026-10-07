import { computed, inject, Injectable, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  DeliveryIncidentView,
  DeliveryPlacementSuggestionView,
  DeliveryRoundsDayView,
} from '@lfd/contracts';

import { dayChoiceOf, OTHER, TODAY } from './day-choice';
import {
  composeDay,
  type ComposedDay,
  type ComposedRound,
  type OrderLists,
  ordersFromOtherDays,
} from './delivery-rounds';
import { DeliveryRoundsService } from './delivery-rounds.service';
import { DeliveryRoutingService } from './delivery-routing.service';
import {
  type Board,
  boardOfComposed,
  type ComposedTiming,
  composedTimingOf,
  NO_TIMING,
} from './rounds-board-model';
import { relaidBoard } from './rounds-board-lists';
import { DAY_QUERY_PARAM, dayOfQuery, isServiceDay, parisDayOf, shiftDay } from './run-sheet';
import { RunSheetService } from './run-sheet.service';

/** Ce que l'organisateur a lu du jour : en cours, raté, ou la composition jointe. */
export type ComposeState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly day: string;
      readonly composed: ComposedDay;
      /** Les signalements du jour (`a-la-porte.md`, § 3), posés par tournée et par arrêt. */
      readonly incidents: readonly DeliveryIncidentView[];
    };

/**
 * **La composition d'un jour, telle que l'organisateur la lit** — sortie de
 * `RoundsPage` pour que la page ne garde que ses gestes.
 *
 * La composition ne porte que des références ; le détail d'un arrêt est celui
 * de la feuille de route. Les deux sont relues **ensemble**, au même moment,
 * et jointes par commande (C16) : jamais une jointure entre deux instants. Le
 * chronométrage (CA5) et les places suggérées (CA7) suivent chaque lecture,
 * et une réponse lente d'une lecture dépassée n'écrase pas la bonne.
 *
 * Il tient aussi le jour affiché, lu dans l'URL et réécrit dans l'URL. Fourni
 * par la page, pas à la racine, comme {@link RoundsPreview} : le jour affiché
 * appartient à un écran.
 */
@Injectable()
export class RoundsDay {
  private readonly rounds = inject(DeliveryRoundsService);
  private readonly runSheet = inject(RunSheetService);
  private readonly routing = inject(DeliveryRoutingService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly today = parisDayOf(new Date());
  /** Le jour de l'URL (`?jour=`) s'il est lisible, sinon demain. */
  readonly day = signal(
    dayOfQuery(this.route.snapshot.queryParamMap.get(DAY_QUERY_PARAM)) ?? shiftDay(this.today, 1),
  );
  /** « Autre jour » choisi : la date s'ouvre, même sur aujourd'hui ou demain. */
  private readonly otherPicked = signal(false);
  readonly dayChoice = computed(() => dayChoiceOf(this.day(), this.today, this.otherPicked()));

  readonly state = signal<ComposeState>({ status: 'loading' });
  /** Les tracés et les alertes rouges (CA5) de la composition enregistrée, chronométrée à la lecture. */
  private readonly timing = signal<ComposedTiming>(NO_TIMING);
  /** La place suggérée de chaque commande à répartir (CA7), lue avec la composition. */
  readonly suggestions = signal<ReadonlyMap<string, DeliveryPlacementSuggestionView>>(new Map());
  /** Le geste en vol, montré avant que le serveur ne l'ait confirmé. */
  readonly optimistic = signal<OrderLists | null>(null);

  /** Un numéro par lecture : une réponse lente d'un autre jour n'écrase pas la bonne. */
  private request = 0;

  readonly incidents = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.incidents : [];
  });

  readonly composed = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.composed : null;
  });

  /** Le tableau enregistré, geste en vol compris. */
  readonly liveBoard = computed<Board | null>(() => {
    const composed = this.composed();
    if (composed === null) {
      return null;
    }
    const board = boardOfComposed(composed, this.timing());
    const pending = this.optimistic();
    return pending === null ? board : relaidBoard(board, pending);
  });

  pickChoice(value: string): void {
    if (value === OTHER) {
      this.otherPicked.set(true);
      return;
    }
    this.otherPicked.set(false);
    this.showDay(shiftDay(this.today, value === TODAY ? 0 : 1));
  }

  pickDate(value: string): void {
    if (isServiceDay(value)) {
      this.showDay(value);
    }
  }

  /**
   * Le jour choisi s'écrit dans l'URL — un lien partagé ou une page rechargée
   * rouvre le même. `replaceUrl` : parcourir dix jours n'empile pas dix pages
   * à dépiler avec « retour ».
   */
  private showDay(day: string): void {
    this.day.set(day);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [DAY_QUERY_PARAM]: day },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  roundById(id: string): ComposedRound | null {
    return this.composed()?.rounds.find(({ round }) => round.id === id) ?? null;
  }

  async load(day: string): Promise<void> {
    const request = ++this.request;
    // Une relecture du même jour garde la composition à l'écran.
    const current = this.state();
    if (current.status !== 'ready' || current.day !== day) {
      this.state.set({ status: 'loading' });
    }
    try {
      // C16 : l'une sans l'autre n'est rien. La feuille suit la composition,
      // qui lui nomme les commandes d'un autre jour placées ici (rapportées, § 4).
      const rounds = await this.rounds.day(day);
      const sheet = await this.runSheet.day(day, ordersFromOtherDays(rounds));
      if (request === this.request) {
        this.state.set({
          status: 'ready',
          day,
          composed: composeDay(rounds, sheet),
          incidents: rounds.incidents,
        });
        void this.loadTiming(rounds, request);
        void this.loadSuggestions(rounds, request);
      }
    } catch {
      if (request === this.request) {
        this.state.set({ status: 'error' });
      }
    }
  }

  /**
   * Les tracés de la composition enregistrée, pour la carte, et ses arrêts
   * que leur place rend intenables — l'alerte rouge (CA5) : une LECTURE
   * (« chronométrer », L10b-C2). Sans calcul routier, la carte garde ses
   * repères seuls et rien n'est rouge — rien ne s'affiche en erreur pour un
   * chronométrage absent.
   */
  private async loadTiming(rounds: DeliveryRoundsDayView, request: number): Promise<void> {
    const timed = rounds.rounds.filter((round) => round.stops.length > 0);
    if (timed.length === 0) {
      this.timing.set(NO_TIMING);
      return;
    }
    try {
      const view = await this.routing.time({
        day: rounds.day,
        rounds: timed.map((round) => ({
          roundId: round.id,
          vehicleId: round.vehicleId,
          orderIds: round.stops.map((stop) => stop.orderId),
        })),
      });
      if (request === this.request) {
        this.timing.set(composedTimingOf(timed, view));
      }
    } catch {
      if (request === this.request) {
        this.timing.set(NO_TIMING);
      }
    }
  }

  /**
   * Les places suggérées (CA7) : seulement quand le jour a des tournées et
   * des commandes à répartir — sinon le serveur n'aurait rien à dire. Une
   * LECTURE ; un échec n'affiche rien, comme le chronométrage : la carte
   * « À répartir » reste celle d'avant CA7.
   */
  private async loadSuggestions(rounds: DeliveryRoundsDayView, request: number): Promise<void> {
    if (rounds.rounds.length === 0 || rounds.unassigned.length === 0) {
      this.suggestions.set(new Map());
      return;
    }
    try {
      const view = await this.routing.suggestions(rounds.day);
      if (request === this.request) {
        this.suggestions.set(new Map(view.suggestions.map((line) => [line.orderId, line])));
      }
    } catch {
      if (request === this.request) {
        this.suggestions.set(new Map());
      }
    }
  }
}
