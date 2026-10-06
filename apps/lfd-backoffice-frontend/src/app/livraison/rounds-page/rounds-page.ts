import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  DestroyRef,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  DeliveryDriverView,
  DeliveryIncidentView,
  DeliveryRoundsDayView,
  VehicleView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import type { FoldSelectOption, FoldViewToggleOption } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDateComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldPageLayoutComponent,
  FoldPopoverTriggerDirective,
  FoldToastComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import type { MapDeparture } from '../delivery-map/delivery-map';
import { vehicleColors } from '../delivery-planning';
import {
  composeDay,
  type ComposedDay,
  type ComposedRound,
  movedOrder,
  type OrderLists,
  ordersFromOtherDays,
  roundLabel,
  serviceDayLabel,
  shiftedOrder,
  sortedByWindow,
  stopCountLabel,
  vehiclesActiveOn,
} from '../delivery-rounds';
import { modeLabel } from '../delivery-routing';
import { DeliveryRoutingService } from '../delivery-routing.service';
import { DeliveryIncidentsService } from '../delivery-incidents.service';
import { DeliveryRoundsService } from '../delivery-rounds.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import { canReadDeliverySettings } from '../delivery-settings-access';
import type { IncidentPhotoLoader } from '../incident-photo/incident-photo';
import {
  type PlannerResult,
  PlannerPopover,
  type PlannerVehicle,
} from '../planner-popover/planner-popover';
import { DayReadinessBanner } from '../day-readiness-banner/day-readiness-banner';
import type { StopShift } from '../round-column/round-column';
import {
  alertCountOf,
  type Board,
  type BoardDrop,
  boardOfComposed,
  type ComposedTiming,
  composedTimingOf,
  layoutOps,
  type LayoutOp,
  listsOf,
  NO_TIMING,
  POOL_KEY,
  relaidBoard,
  roundKmLabel,
} from '../rounds-board-model';
import { type RoundGesture, RoundsBoard } from '../rounds-board/rounds-board';
import { RoundsPreview } from '../rounds-preview';
import { DAY_QUERY_PARAM, dayOfQuery, isServiceDay, parisDayOf, shiftDay } from '../run-sheet';
import { RunSheetService } from '../run-sheet.service';
import { vehicleBadgeLabel } from '../vehicle-load';

type ComposeState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly day: string;
      readonly composed: ComposedDay;
      /** Les signalements du jour (`plan-a-la-porte.md`, § 3), posés par tournée et par arrêt. */
      readonly incidents: readonly DeliveryIncidentView[];
    };

type FleetState = readonly VehicleView[] | 'error' | null;

/** Le bandeau « Annuler » : ce qui vient d'être fait, et comment le défaire. */
interface UndoToast {
  readonly id: number;
  readonly text: string;
  readonly undo: (() => void) | null;
}

const TODAY = '0';
const TOMORROW = '1';
const OTHER = 'other';
/** Le temps de lire le bandeau et de se raviser. */
const UNDO_MS = 8000;

/** Ce qu'on dit quand le serveur refuse une composition devenue périmée, sans phrase à lui. */
const CHANGED = 'La composition a changé entre-temps : elle vient d’être relue.';
const PROPOSAL_CHANGED = 'La composition a changé entre-temps : reproposez.';
const CONFLICT = 409;

/**
 * **Livraison › Organisation de tournées** — l'organisateur (`handoff-tournees/SPEC.md`) :
 * répartir les livraisons d'un jour entre les véhicules, puis ranger chaque
 * tournée, dans un seul tableau à trois colonnes.
 *
 * La composition ne porte que des références ; le détail d'un arrêt est celui
 * de la feuille de route. Les deux sont relues **ensemble**, au même moment,
 * et jointes par commande (C16) : jamais une jointure entre deux instants.
 *
 * Un geste (glisser, « Mettre dans », ↑ ↓, retirer, ranger) devient les
 * listes visées ; la page en tire les affectations, déplacements et retraits,
 * puis envoie chaque permutation ENTIÈRE (I2). Il s'annule en renvoyant les
 * listes d'avant. Aucune écriture n'est rejouée : un refus parce que la
 * composition a changé (409) s'affiche et relit.
 *
 * « Proposer » remplit le même tableau en aperçu ({@link RoundsPreview}) :
 * rien n'est écrit avant « Appliquer ».
 */
@Component({
  selector: 'app-rounds-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RoundsPreview],
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDateComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldPageLayoutComponent,
    FoldPopoverTriggerDirective,
    FoldToastComponent,
    FoldViewToggleComponent,
    DayReadinessBanner,
    PlannerPopover,
    RoundsBoard,
  ],
  templateUrl: './rounds-page.html',
  styleUrl: './rounds-page.scss',
})
export class RoundsPage {
  private readonly rounds = inject(DeliveryRoundsService);
  private readonly incidentsService = inject(DeliveryIncidentsService);
  private readonly runSheet = inject(RunSheetService);
  private readonly settings = inject(DeliverySettingsService);
  private readonly routing = inject(DeliveryRoutingService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly preview = inject(RoundsPreview);

  private readonly today = parisDayOf(new Date());

  protected readonly dayOptions: readonly FoldViewToggleOption[] = [
    { value: TODAY, label: 'Aujourd’hui' },
    { value: TOMORROW, label: 'Demain' },
    { value: OTHER, label: 'Autre jour' },
  ];

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Le jour de l'URL (`?jour=`) s'il est lisible, sinon demain. */
  protected readonly day = signal(
    dayOfQuery(this.route.snapshot.queryParamMap.get(DAY_QUERY_PARAM)) ?? shiftDay(this.today, 1),
  );
  /** « Autre jour » choisi : la date s'ouvre, même sur aujourd'hui ou demain. */
  private readonly otherPicked = signal(false);
  protected readonly dayChoice = computed(() => {
    const day = this.day();
    if (this.otherPicked()) {
      return OTHER;
    }
    if (day === this.today) {
      return TODAY;
    }
    return day === shiftDay(this.today, 1) ? TOMORROW : OTHER;
  });

  protected readonly state = signal<ComposeState>({ status: 'loading' });
  private readonly reload = signal(0);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_rounds:write'));
  /** Le panneau « Proposer les tournées » — le bandeau du plan arrêté peut l'ouvrir (CA6a). */
  protected readonly plannerOpen = signal(false);
  protected readonly canReadSettings = computed(() =>
    canReadDeliverySettings((permission) => this.permissions.can(permission)),
  );
  protected readonly canSeePhotos = computed(() =>
    this.permissions.can('delivery_procedures:read'),
  );

  /** Le dernier refus du serveur — la composition reste à l'écran. */
  protected readonly refusal = signal<string | null>(null);
  /** Une écriture en vol : une seule à la fois, les contrôles attendent. */
  protected readonly busy = signal(false);
  protected readonly toast = signal<UndoToast | null>(null);
  private toastCount = 0;

  private readonly fleet = signal<FleetState>(null);
  protected readonly fleetUnreadable = computed(() => this.fleet() === 'error');

  /** Les livreurs affectables (MT-D2 v2) — lus seulement pour qui compose. */
  private readonly drivers = signal<readonly DeliveryDriverView[] | 'error' | null>(null);
  protected readonly driversUnreadable = computed(() => this.drivers() === 'error');
  protected readonly driverOptions = computed<readonly FoldSelectOption<string>[]>(() => {
    const drivers = this.drivers();
    return Array.isArray(drivers)
      ? drivers.map((driver) => ({ value: driver.staffUserId, label: driver.name }))
      : [];
  });

  /** Le départ des tournées, lu dans les réglages ; `null` : pas de carte. */
  private readonly departurePoint = signal<MapDeparture | null>(null);
  protected readonly departure = computed<MapDeparture | null>(
    () => this.preview.proposal()?.departurePoint ?? this.departurePoint(),
  );
  /** Les tracés et les alertes rouges (CA5) de la composition enregistrée, chronométrée à la lecture. */
  private readonly timing = signal<ComposedTiming>(NO_TIMING);
  /** Le geste en vol, montré avant que le serveur ne l'ait confirmé. */
  private readonly optimistic = signal<OrderLists | null>(null);

  /** Le dernier PDF de tournée n'a pas pu être téléchargé. */
  protected readonly pdfFailed = signal(false);
  /**
   * L'URL objet du dernier PDF, quand le navigateur a bloqué l'onglet : on
   * propose alors de le télécharger. `null` sinon.
   */
  protected readonly blockedPdfUrl = signal<string | null>(null);
  /**
   * L'URL objet vivante. Révoquée au PDF suivant et à la destruction de
   * l'écran — pas après un délai, qui couperait un onglet encore en train de
   * charger.
   */
  private objectUrl: string | null = null;

  protected readonly incidents = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.incidents : [];
  });
  /** La photo d'un signalement, par la route de l'admin (`delivery_rounds`). */
  protected readonly incidentPhoto: IncidentPhotoLoader = (incidentId) =>
    this.incidentsService.photo(incidentId);

  protected readonly composed = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.composed : null;
  });

  /** Le tableau enregistré, geste en vol compris. */
  private readonly liveBoard = computed<Board | null>(() => {
    const composed = this.composed();
    if (composed === null) {
      return null;
    }
    const board = boardOfComposed(composed, this.timing());
    const pending = this.optimistic();
    return pending === null ? board : relaidBoard(board, pending);
  });

  /** Ce que montre le tableau : l'aperçu s'il y en a un, sinon la composition. */
  protected readonly board = computed(() => this.preview.board() ?? this.liveBoard());

  private readonly activeVehicles = computed(() => {
    const fleet = this.fleet();
    return Array.isArray(fleet) ? vehiclesActiveOn(fleet, this.day()) : [];
  });

  /** La couleur de chaque véhicule : son rang dans la flotte, puis dans les tournées du jour. */
  protected readonly colors = computed(() =>
    vehicleColors([
      ...this.activeVehicles().map((vehicle) => vehicle.id),
      ...(this.composed()?.rounds.map(({ round }) => round.vehicleId) ?? []),
      ...(this.preview.board()?.rounds.map((round) => round.vehicleId) ?? []),
    ]),
  );

  /** Le chargement de chaque véhicule connu — lecture seule (L2b-C3, L2b-C4). */
  protected readonly loadBadges = computed(() => {
    const fleet = this.fleet();
    return new Map(
      Array.isArray(fleet)
        ? fleet.flatMap((vehicle) => {
            const label = vehicleBadgeLabel(vehicle);
            return label === null ? [] : [[vehicle.id, label] as const];
          })
        : [],
    );
  });

  /** « + Nouvelle tournée » : un véhicule déjà engagé ouvre son passage suivant (Q13). */
  protected readonly newRoundChoices = computed(() => {
    const rounds = this.composed()?.rounds ?? [];
    return this.activeVehicles().map((vehicle) => {
      const count = rounds.filter(({ round }) => round.vehicleId === vehicle.id).length;
      return {
        id: vehicle.id,
        name: vehicle.name,
        color: this.colors().get(vehicle.id) ?? '',
        sub: count > 0 ? `passage ${String(count + 1)}` : (this.loadBadges().get(vehicle.id) ?? ''),
      };
    });
  });

  /** Les véhicules qu'on coche dans « Proposer ». */
  protected readonly plannerVehicles = computed<readonly PlannerVehicle[]>(() => {
    const rounds = this.composed()?.rounds ?? [];
    return this.activeVehicles().map((vehicle) => {
      const own = rounds.filter(({ round }) => round.vehicleId === vehicle.id);
      const open = own.filter(({ round }) => round.departedAt === null);
      const excluded = own.length > 0 && open.length === 0;
      const stops = open.reduce((total, { stops: placed }) => total + placed.length, 0);
      return {
        id: vehicle.id,
        name: vehicle.name,
        color: this.colors().get(vehicle.id) ?? '',
        sub: excluded ? 'partie · exclue' : stopCountLabel(stops),
        excluded,
      };
    });
  });

  protected readonly summary = computed(() => {
    const board = this.board();
    const rounds = board?.rounds ?? [];
    const stops = rounds.reduce((total, round) => total + round.stops.length, 0);
    return {
      pool: board?.pool.length ?? 0,
      rounds: `${rounds.length === 1 ? '1 tournée' : `${String(rounds.length)} tournées`} · ${
        stops === 1 ? '1 arrêt' : `${String(stops)} arrêts`
      }`,
      alerts: rounds.reduce((total, round) => total + alertCountOf(round), 0),
    };
  });

  protected readonly previewMode = computed(() => {
    const proposal = this.preview.proposal();
    if (proposal === null) {
      return '';
    }
    return this.preview.recomposed() ? 'Tout recomposé' : modeLabel(proposal.mode);
  });

  protected readonly canApply = computed(
    () =>
      this.canWrite() &&
      !this.busy() &&
      !this.preview.timing() &&
      (this.preview.applyPayload()?.rounds.length ?? 0) > 0,
  );

  protected readonly dayLabel = computed(() => serviceDayLabel(this.day()));
  protected readonly kmLabel = roundKmLabel;
  protected readonly undoMs = UNDO_MS;

  /** Un numéro par lecture : une réponse lente d'un autre jour n'écrase pas la bonne. */
  private request = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.revokePdf());
    effect(() => {
      const day = this.day();
      this.reload();
      untracked(() => void this.load(day));
    });
    effect(() => {
      this.day();
      untracked(() => {
        this.preview.discard();
        this.toast.set(null);
      });
    });
    effect(() => {
      if (this.canWrite()) {
        untracked(() => {
          void this.loadFleet();
          void this.loadDrivers();
        });
      }
    });
    effect(() => {
      if (this.canReadSettings()) {
        untracked(() => void this.loadDeparture());
      }
    });
  }

  protected pickChoice(value: string): void {
    if (value === OTHER) {
      this.otherPicked.set(true);
      return;
    }
    this.otherPicked.set(false);
    this.showDay(shiftDay(this.today, value === TODAY ? 0 : 1));
  }

  protected pickDate(value: string): void {
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

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  // ─── Les gestes du tableau ─────────────────────────────────────────────

  /** Glisser, « Mettre dans », un dépôt sur un onglet — une commande change de place. */
  protected onDrop(drop: BoardDrop): void {
    const board = this.board();
    if (board === null) {
      return;
    }
    const target = board.rounds.find((round) => round.key === drop.to.list);
    const source = board.rounds.find((round) => round.key === drop.from.list);
    if (target?.frozen === true) {
      this.showToast(`${roundLabel(target)} est partie : rien ne s’y dépose.`, null);
      return;
    }
    if (source?.frozen === true) {
      return;
    }
    const lists = listsOf(board);
    const index = lists[drop.from.list]?.indexOf(drop.orderId) ?? -1;
    const next = movedOrder(lists, { list: drop.from.list, index }, drop.to);
    if (next === null) {
      return;
    }
    const reference = this.referenceOf(board, drop.orderId);
    if (target === undefined) {
      this.relayout(next, `${reference} retirée · à répartir`);
      return;
    }
    const position = (next[target.key]?.indexOf(drop.orderId) ?? 0) + 1;
    this.relayout(next, `${reference} → ${roundLabel(target)} · arrêt ${String(position)}`);
  }

  /** ↑ ↓ : la permutation entière, l'arrêt monté ou descendu d'un rang. */
  protected onShift(gesture: RoundGesture<StopShift>): void {
    const board = this.board();
    const round = board?.rounds.find((candidate) => candidate.key === gesture.key);
    if (board === null || round === undefined || round.frozen) {
      return;
    }
    const ids = round.stops.map((stop) => stop.orderId);
    const next = shiftedOrder(ids, gesture.value.index, gesture.value.delta);
    const moving = ids[gesture.value.index];
    if (next === null || moving === undefined) {
      return;
    }
    const position = gesture.value.index + gesture.value.delta + 1;
    this.relayout(
      { [round.key]: next },
      `${this.referenceOf(board, moving)} → ${roundLabel(round)} · arrêt ${String(position)}`,
    );
  }

  /** « Retirer de la tournée » (Q11 : à la main) — la commande revient à répartir. */
  protected onRemove(gesture: RoundGesture<string>): void {
    const board = this.board();
    const round = board?.rounds.find((candidate) => candidate.key === gesture.key);
    if (board === null || round === undefined || round.frozen) {
      return;
    }
    const lists = listsOf(board);
    this.relayout(
      {
        [round.key]: round.stops.map((stop) => stop.orderId).filter((id) => id !== gesture.value),
        [POOL_KEY]: [...(lists[POOL_KEY] ?? []), gesture.value],
      },
      `${this.referenceOf(board, gesture.value)} retirée · à répartir`,
    );
  }

  /** « Ranger par créneau » : par début de fenêtre, puis la permutation entière (I2, C8). */
  protected onSort(key: string): void {
    const round = this.board()?.rounds.find((candidate) => candidate.key === key);
    if (round === undefined || round.frozen) {
      return;
    }
    const sorted = sortedByWindow(round.stops).map((stop) => stop.orderId);
    if (sorted.every((id, index) => id === round.stops[index]?.orderId)) {
      return;
    }
    this.relayout({ [key]: sorted }, `${roundLabel(round)} · rangée par créneau`);
  }

  protected noTarget(vehicleName: string): void {
    this.showToast(`${vehicleName} : aucune tournée en préparation.`, null);
  }

  protected undo(): void {
    const toast = this.toast();
    this.toast.set(null);
    toast?.undo?.();
  }

  protected dismissToast(id: number): void {
    if (this.toast()?.id === id) {
      this.toast.set(null);
    }
  }

  /** Les listes visées : en aperçu, recomposées sur place ; sinon, écrites puis relues. */
  private relayout(next: OrderLists, text: string): void {
    if (this.preview.active()) {
      const snapshot = this.preview.snapshot();
      if (this.preview.relayout(next)) {
        this.showToast(text, () => this.preview.restore(snapshot));
      }
      return;
    }
    const board = this.liveBoard();
    if (board === null || this.busy()) {
      return;
    }
    const lists = listsOf(board);
    const before: OrderLists = Object.fromEntries(
      Object.keys(next).map((key) => [key, lists[key] ?? []]),
    );
    void this.writeLayout(next, false).then((written) => {
      if (written) {
        this.showToast(text, () => void this.writeLayout(before, true));
      }
    });
  }

  private showToast(text: string, undo: (() => void) | null): void {
    this.toastCount += 1;
    this.toast.set({ id: this.toastCount, text, undo });
  }

  /**
   * Écrit des listes visées : d'abord qui change de tournée, puis l'ordre de
   * chaque tournée touchée, en permutation ENTIÈRE (I2). Chaque écriture relit
   * avant la suivante — les versions et les arrêts créés en dépendent.
   *
   * `force` renvoie la permutation même si la composition lue la porte déjà :
   * « Annuler » renvoie exactement celle d'avant.
   */
  private writeLayout(desired: OrderLists, force: boolean): Promise<boolean> {
    const board = this.liveBoard();
    if (board === null) {
      return Promise.resolve(false);
    }
    const ops = layoutOps(listsOf(board), desired);
    this.optimistic.set(desired);
    return this.write(async () => {
      for (const op of ops) {
        await this.perform(op);
        await this.load(this.day());
      }
      for (const [key, wanted] of Object.entries(desired)) {
        if (key !== POOL_KEY && (await this.reorder(key, wanted, force))) {
          await this.load(this.day());
        }
      }
    }, 'La composition n’a pas pu être enregistrée.');
  }

  private async perform(op: LayoutOp): Promise<void> {
    if (op.kind === 'assign') {
      const target = this.roundById(op.to);
      if (target !== null) {
        await this.rounds.assign(target.round.id, {
          orderId: op.orderId,
          version: target.round.version,
        });
      }
      return;
    }
    const from = this.roundById(op.from);
    const stop = from?.stops.find((line) => line.stop.orderId === op.orderId)?.stop;
    if (from === null || stop === undefined) {
      return;
    }
    if (op.kind === 'remove') {
      await this.rounds.remove(from.round.id, stop.stopId, { version: from.round.version });
      return;
    }
    const target = this.roundById(op.to);
    if (target !== null) {
      await this.rounds.move(from.round.id, stop.stopId, {
        toRoundId: target.round.id,
        fromVersion: from.round.version,
        toVersion: target.round.version,
      });
    }
  }

  /** La permutation entière d'une tournée, si elle porte bien ces commandes-là. */
  private async reorder(key: string, wanted: readonly string[], force: boolean): Promise<boolean> {
    const current = this.roundById(key);
    if (current === null || wanted.length === 0) {
      return false;
    }
    const stopIds = new Map(current.stops.map(({ stop }) => [stop.orderId, stop.stopId]));
    const same = wanted.length === current.stops.length && wanted.every((id) => stopIds.has(id));
    const unchanged = wanted.every((id, index) => current.stops[index]?.stop.orderId === id);
    if (!same || (unchanged && !force)) {
      return false;
    }
    await this.rounds.reorder(current.round.id, {
      stopIds: wanted.map((id) => stopIds.get(id) ?? id),
      version: current.round.version,
    });
    return true;
  }

  private referenceOf(board: Board, orderId: string): string {
    return (
      board.pool.find((order) => order.orderId === orderId)?.reference ??
      board.rounds.flatMap((round) => round.stops).find((stop) => stop.orderId === orderId)
        ?.reference ??
      orderId
    );
  }

  // ─── La tournée elle-même ──────────────────────────────────────────────

  protected openRound(vehicleId: string): Promise<boolean> {
    return this.write(
      () => this.rounds.open({ day: this.day(), vehicleId }),
      'La tournée n’a pas pu être ouverte.',
    );
  }

  /** Affecter un livreur (MT-D2) ; une tournée partie est refusée par le serveur, qui le dit. */
  protected assignDriver(gesture: RoundGesture<string>): Promise<boolean> {
    const round = this.roundById(gesture.key)?.round;
    if (round === undefined) {
      return Promise.resolve(false);
    }
    return this.write(
      () =>
        this.rounds.assignDriver(round.id, { staffUserId: gesture.value, version: round.version }),
      'Le livreur n’a pas pu être affecté.',
    );
  }

  protected unassignDriver(key: string): Promise<boolean> {
    const round = this.roundById(key)?.round;
    if (round === undefined) {
      return Promise.resolve(false);
    }
    return this.write(
      () => this.rounds.unassignDriver(round.id, { version: round.version }),
      'Le livreur n’a pas pu être retiré.',
    );
  }

  /** « Déclarer rentrée » (PL2) — quand le livreur a oublié, ou qu'aucun n'était affecté. */
  protected returnToDepot(key: string): Promise<boolean> {
    return this.write(
      () => this.rounds.returnToDepot(key),
      'La tournée n’a pas pu être déclarée rentrée.',
    );
  }

  /**
   * Télécharge la feuille PDF de la tournée, rendue par le serveur, et l'ouvre
   * dans un nouvel onglet — le geste du dossier du Prévisionnel. Si le
   * navigateur bloque l'onglet (`window.open` rend `null`), on garde l'URL et
   * on propose un lien de téléchargement à la place.
   */
  protected async print(roundId: string): Promise<void> {
    this.pdfFailed.set(false);
    this.blockedPdfUrl.set(null);
    try {
      const blob = await this.rounds.roundPdf(roundId);
      this.revokePdf();
      const url = URL.createObjectURL(blob);
      this.objectUrl = url;
      if (window.open(url, '_blank') === null) {
        this.blockedPdfUrl.set(url);
      }
    } catch {
      this.pdfFailed.set(true);
    }
  }

  private revokePdf(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  // ─── L'aperçu d'une proposition ────────────────────────────────────────

  protected showProposal(result: PlannerResult): void {
    this.toast.set(null);
    this.refusal.set(null);
    this.preview.show(result.proposal, this.composed(), result.recomposed);
  }

  /** Les arrêts viennent d'être situés : un aperçu affiché les ignorait. */
  protected located(): void {
    this.preview.discard();
    this.retry();
  }

  protected discard(): void {
    this.preview.discard();
    this.toast.set(null);
  }

  protected async apply(): Promise<void> {
    if (!this.canApply()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await this.preview.apply();
      this.toast.set(null);
      this.notify.success('Proposition appliquée : elle se corrige à la main comme avant.');
    } catch (error) {
      const changed = error instanceof HttpErrorResponse && error.status === CONFLICT;
      // Jamais rejouée : elle écraserait ce qu'un collègue vient de composer.
      if (changed) {
        this.preview.discard();
      }
      this.refusal.set(
        httpErrorMessage(
          error,
          changed ? PROPOSAL_CHANGED : 'La proposition n’a pas pu être appliquée.',
        ),
      );
    } finally {
      await this.load(this.day());
      this.busy.set(false);
    }
  }

  // ─── Lectures et écritures ─────────────────────────────────────────────

  private roundById(id: string): ComposedRound | null {
    return this.composed()?.rounds.find(({ round }) => round.id === id) ?? null;
  }

  /** Une écriture : une à la fois, relue ensuite ; `true` si elle a abouti. */
  private async write(gesture: () => Promise<void>, fallback: string): Promise<boolean> {
    if (this.busy()) {
      return false;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await gesture();
      await this.load(this.day());
      return true;
    } catch (error) {
      // Un 409 dit que la composition affichée est périmée. Jamais un nouvel
      // essai en silence : il écraserait ce qu'un collègue vient de faire.
      const changed = error instanceof HttpErrorResponse && error.status === CONFLICT;
      this.refusal.set(httpErrorMessage(error, changed ? CHANGED : fallback));
      // Relire dans tous les cas : un tableau resté sur le geste refusé
      // mentirait sur la tournée de l'arrêt.
      await this.load(this.day());
      return false;
    } finally {
      this.optimistic.set(null);
      this.busy.set(false);
    }
  }

  private async load(day: string): Promise<void> {
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

  private async loadDeparture(): Promise<void> {
    try {
      const { point } = await this.settings.departure();
      const gps = point?.gps ?? null;
      this.departurePoint.set(point === null || gps === null ? null : { label: point.label, gps });
    } catch {
      this.departurePoint.set(null);
    }
  }

  private async loadDrivers(): Promise<void> {
    try {
      this.drivers.set((await this.rounds.drivers()).drivers);
    } catch {
      this.drivers.set('error');
    }
  }

  private async loadFleet(): Promise<void> {
    try {
      this.fleet.set((await this.settings.vehicles()).vehicles);
    } catch {
      this.fleet.set('error');
    }
  }
}
