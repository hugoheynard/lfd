import {
  CdkDrag,
  type CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { DeliveryIncidentView } from '@lfd/contracts';
import type { FoldSelectOption, FoldViewToggleOption } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLinkComponent,
  FoldLoadingStateComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { DeliveryMap, type MapDeparture } from '../delivery-map/delivery-map';
import { stopPointOf } from '../delivery-planning';
import {
  passageCountLabel,
  roundCountLabel,
  shortRoundLabel,
  windowShortLabel,
} from '../delivery-rounds';
import type { IncidentPhotoLoader } from '../incident-photo/incident-photo';
import { OrderCard } from '../order-card/order-card';
import { RoundColumn, type StopShift } from '../round-column/round-column';
import {
  alertCountOf,
  type Board,
  type BoardDrop,
  type BoardOrder,
  type BoardRound,
  cardMetaOf,
  cardTitleOf,
  dropTargetOf,
  mapRowPrefixOf,
  needsGps,
  orderAriaOf,
  orderTagsOf,
  plannedOfBoard,
  POOL_KEY,
  vehicleGroupsOf,
} from '../rounds-board-model';

/** Ce que montre la colonne centrale : une lecture en cours, ratée, ou le tableau. */
export type BoardStatus = 'loading' | 'error' | 'ready';

/** Un geste sur une tournée, nommé par sa clé. */
export interface RoundGesture<T> {
  readonly key: string;
  readonly value: T;
}

const ALL = 'all';
const TAB_PREFIX = 'tab:';
const SCOPE_VEHICLE = 'vehicle';
const SCOPE_ALL = 'all';

/**
 * **L'organisateur de tournées** (`handoff-tournees/SPEC.md`) : trois
 * colonnes fixes — « À répartir », les tournées par onglet véhicule, la carte
 * — dans un seul groupe de glisser-déposer.
 *
 * Le tableau ne décide rien de la composition : chaque geste remonte comme
 * un {@link BoardDrop} (ou ↑ ↓, retirer, ranger), et la page écrit — ou, en
 * aperçu, recompose localement. Il ne garde que l'état de la vue : l'onglet,
 * la portée de la carte, l'arrêt survolé.
 */
@Component({
  selector: 'app-rounds-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    CdkDragPlaceholder,
    CdkDropList,
    CdkDropListGroup,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLinkComponent,
    FoldLoadingStateComponent,
    FoldViewToggleComponent,
    DeliveryMap,
    OrderCard,
    RoundColumn,
  ],
  templateUrl: './rounds-board.html',
  styleUrl: './rounds-board.scss',
})
export class RoundsBoard {
  private readonly router = inject(Router);

  readonly status = input.required<BoardStatus>();
  readonly board = input<Board | null>(null);
  readonly preview = input(false);
  readonly canWrite = input(false);
  readonly busy = input(false);
  /** La couleur de chaque véhicule, par identifiant. */
  readonly colors = input<ReadonlyMap<string, string>>(new Map());
  readonly drivers = input<readonly FoldSelectOption<string>[]>([]);
  readonly incidents = input<readonly DeliveryIncidentView[]>([]);
  readonly incidentPhoto = input.required<IncidentPhotoLoader>();
  /** « 5,5 m³ ❄ » par véhicule — ce que la flotte dit de sa charge (L2b-C3). */
  readonly loadBadges = input<ReadonlyMap<string, string>>(new Map());
  /** Le départ et le retour de toutes les tournées ; `null` : pas de carte. */
  readonly departure = input<MapDeparture | null>(null);
  /** Ouvrir le carnet d'adresses d'un client. */
  readonly canOpenClients = input(false);

  readonly dropped = output<BoardDrop>();
  readonly shifted = output<RoundGesture<StopShift>>();
  readonly removed = output<RoundGesture<string>>();
  readonly sorted = output<string>();
  readonly driverAssigned = output<RoundGesture<string>>();
  readonly driverRemoved = output<string>();
  readonly returned = output<string>();
  readonly printed = output<string>();
  readonly retry = output();
  /** Un dépôt sur l'onglet d'un véhicule qui n'a aucune tournée en préparation. */
  readonly noTarget = output<string>();

  protected readonly poolKey = POOL_KEY;
  protected readonly tabPrefix = TAB_PREFIX;
  /** `all`, ou l'identifiant du véhicule dont l'onglet est ouvert. */
  protected readonly tab = signal<string>(ALL);
  /** La carte montre aussi les autres tournées, estompées. */
  protected readonly mapAll = signal(true);
  protected readonly highlighted = signal<string | null>(null);
  /** Un glisser est en cours : l'onglet véhicule rappelle qu'on peut déposer sur un onglet. */
  protected readonly dragging = signal(false);
  protected readonly tabOver = signal<string | null>(null);

  private readonly rounds = computed(() => this.board()?.rounds ?? []);
  protected readonly pool = computed(() => this.board()?.pool ?? []);
  protected readonly groups = computed(() => vehicleGroupsOf(this.rounds()));

  /** L'onglet ouvert, s'il désigne toujours un véhicule du jour. */
  protected readonly vehicleTab = computed(() => {
    const tab = this.tab();
    return this.groups().find((group) => group.vehicleId === tab) ?? null;
  });

  protected readonly visibleGroups = computed(() => {
    const vehicle = this.vehicleTab();
    return vehicle === null ? this.groups() : [vehicle];
  });

  protected readonly tabs = computed(() =>
    this.groups().map((group) => ({
      vehicleId: group.vehicleId,
      label: group.vehicleName,
      count: passageCountLabel(group.rounds.length),
      alerts: group.rounds.reduce((total, round) => total + alertCountOf(round), 0),
    })),
  );
  protected readonly allCount = computed(() => roundCountLabel(this.rounds().length));
  protected readonly allAlerts = computed(() =>
    this.rounds().reduce((total, round) => total + alertCountOf(round), 0),
  );

  /** Les tournées où « Mettre dans » peut envoyer une commande. */
  protected readonly openRounds = computed(() => this.rounds().filter((round) => !round.frozen));

  /** Ce que la carte regarde : toutes les tournées, ou celles du véhicule ouvert. */
  private readonly mains = computed(() => {
    const vehicle = this.vehicleTab();
    return vehicle === null ? this.rounds() : vehicle.rounds;
  });

  /** Deux segments toujours, comme la maquette ; sur « Toutes », « Ce véhicule » ne vise rien. */
  protected readonly scopeOptions: readonly FoldViewToggleOption[] = [
    { value: SCOPE_VEHICLE, label: 'Ce véhicule' },
    { value: SCOPE_ALL, label: 'Toutes' },
  ];
  protected readonly scope = computed(() =>
    this.vehicleTab() === null || this.mapAll() ? SCOPE_ALL : SCOPE_VEHICLE,
  );

  protected readonly mapRounds = computed(() => {
    const shown = this.scope() === SCOPE_ALL ? this.rounds() : this.mains();
    return shown.filter((round) => round.stops.length > 0).map(plannedOfBoard);
  });
  /** Les autres tournées, en pointillé à 40 %, quand un véhicule est ouvert sur « Toutes ». */
  protected readonly mapMuted = computed(() => {
    const vehicle = this.vehicleTab();
    return new Set(
      vehicle === null
        ? []
        : this.rounds()
            .filter((round) => round.vehicleId !== vehicle.vehicleId)
            .map((round) => round.key),
    );
  });
  /** Le second passage du véhicule ouvert, en tirets. */
  protected readonly mapDashed = computed(() => {
    const vehicle = this.vehicleTab();
    return new Set(vehicle === null ? [] : vehicle.rounds.slice(1).map((round) => round.key));
  });

  protected readonly mapTitle = computed(
    () => this.vehicleTab()?.vehicleName ?? 'Toutes les tournées',
  );
  protected readonly mapSubtitle = computed(() => {
    const mains = this.mains();
    const count = mains.reduce((total, round) => total + round.stops.length, 0);
    const departure = this.departure();
    const parts = [count === 1 ? '1 arrêt' : `${String(count)} arrêts`];
    if (departure !== null) {
      parts.push(`départ et retour ${departure.label}`);
    }
    if (this.vehicleTab() !== null && mains.length > 1) {
      parts.push('passage 2 en tirets');
    }
    return parts.join(' · ');
  });

  protected readonly mapRows = computed(() => {
    const mains = this.mains();
    const inVehicle = this.vehicleTab() !== null;
    return mains.flatMap((round) =>
      round.stops.map((stop, index) => ({
        orderId: stop.orderId,
        number: index + 1,
        color: this.colorOf(round.vehicleId),
        title: `${mapRowPrefixOf(round, inVehicle, mains.length > 1)}${cardTitleOf(stop)}`,
        window: windowShortLabel(stop.window),
        clash: stop.windowClash !== null,
      })),
    );
  });

  protected readonly mapNote = computed(() => {
    const stops = this.mains().flatMap((round) => round.stops);
    const missing = stops.filter((stop) => stopPointOf({ sheet: stop.sheet }) === null).length;
    const parts: string[] = [];
    if (missing === 1) {
      parts.push('1 arrêt non situé, absent de la carte.');
    } else if (missing > 1) {
      parts.push(`${String(missing)} arrêts non situés, absents de la carte.`);
    }
    if (stops.some((stop) => stop.windowClash !== null)) {
      parts.push('Fenêtre intenable : l’ordre fait revenir en arrière.');
    }
    return parts.join(' ');
  });

  protected readonly poolSubtitle = computed(() =>
    this.preview()
      ? 'Ce que le calcul n’a pas placé, avec sa raison.'
      : 'Dans aucune tournée : aucune ne doit partir oubliée.',
  );

  protected readonly titleOf = cardTitleOf;
  protected readonly tagsOf = orderTagsOf;
  protected readonly ariaOf = orderAriaOf;
  protected readonly shortRoundLabel = shortRoundLabel;
  protected readonly passageCountLabel = passageCountLabel;
  protected readonly needsGps = needsGps;

  protected metaOf(order: BoardOrder): string {
    return cardMetaOf(order.reference, order.sheet);
  }

  protected windowOf(order: BoardOrder): string {
    return windowShortLabel(order.sheet?.window ?? null);
  }

  protected colorOf(vehicleId: string): string {
    return this.colors().get(vehicleId) ?? 'var(--fold-color-text-muted)';
  }

  protected loadOf(vehicleId: string): string | null {
    return this.loadBadges().get(vehicleId) ?? null;
  }

  /** « Passage 1 » / « Tournée unique ». */
  protected columnTitle(rounds: readonly BoardRound[], index: number): string {
    return rounds.length > 1
      ? `Passage ${String(rounds[index]?.passage ?? index + 1)}`
      : 'Tournée unique';
  }

  /** « part en premier » / « après le passage 1 ». */
  protected passageNote(rounds: readonly BoardRound[], index: number): string | null {
    if (rounds.length < 2) {
      return null;
    }
    const previous = rounds[index - 1];
    return previous === undefined
      ? 'part en premier'
      : `après le passage ${String(previous.passage)}`;
  }

  protected pickTab(vehicleId: string): void {
    this.tab.set(vehicleId);
    this.mapAll.set(vehicleId === ALL);
  }

  /** Sans véhicule ouvert, « Ce véhicule » n'a rien à montrer : la carte reste sur toutes. */
  protected pickScope(value: string): void {
    this.mapAll.set(this.vehicleTab() === null || value === SCOPE_ALL);
  }

  /** « Mettre dans » : l'équivalent clavier du glisser, en fin de tournée. */
  protected put(order: BoardOrder, index: number, round: BoardRound): void {
    this.dropped.emit({
      orderId: order.orderId,
      from: { list: POOL_KEY, index },
      to: { list: round.key, index: round.stops.length },
    });
  }

  protected openCarnet(order: BoardOrder): void {
    const company = order.sheet?.addressBook?.companyId;
    if (company !== undefined) {
      void this.router.navigateByUrl(
        `/comptes-clients/${encodeURIComponent(company)}/informations`,
      );
    }
  }

  protected canOpenCarnet(order: BoardOrder): boolean {
    return this.canOpenClients() && order.sheet !== null && order.sheet.addressBook !== null;
  }

  /** Lâcher sur « À répartir » : seul un arrêt de tournée y retourne — retirer. */
  protected dropOnPool(event: CdkDragDrop<string, string, string>): void {
    if (event.previousContainer.data === POOL_KEY) {
      return;
    }
    this.dropped.emit({
      orderId: event.item.data,
      from: { list: event.previousContainer.data, index: event.previousIndex },
      to: { list: POOL_KEY, index: event.currentIndex },
    });
  }

  /**
   * Lâcher sur un onglet : en fin du DERNIER passage en préparation du
   * véhicule, puis l'onglet s'ouvre. Sans passage en préparation, rien ne part.
   */
  protected dropOnTab(event: CdkDragDrop<string, string, string>, vehicleId: string): void {
    this.tabOver.set(null);
    const group = this.groups().find((candidate) => candidate.vehicleId === vehicleId);
    if (group === undefined) {
      return;
    }
    const target = dropTargetOf(this.rounds(), vehicleId);
    if (target === null) {
      this.noTarget.emit(group.vehicleName);
      return;
    }
    if (target.key !== event.previousContainer.data) {
      this.dropped.emit({
        orderId: event.item.data,
        from: { list: event.previousContainer.data, index: event.previousIndex },
        to: { list: target.key, index: target.stops.length },
      });
    }
    this.pickTab(vehicleId);
    this.mapAll.set(false);
  }

  protected dropOnRound(drop: BoardDrop): void {
    this.dropped.emit(drop);
  }
}
