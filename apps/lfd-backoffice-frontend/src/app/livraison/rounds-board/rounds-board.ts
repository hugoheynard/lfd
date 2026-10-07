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
import type { DeliveryIncidentView, DeliveryPlacementSuggestionView } from '@lfd/contracts';
import type { FoldSelectOption } from 'fold-ng';
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
import { passageCountLabel, roundCountLabel, shortRoundLabel } from '../delivery-rounds';
import type { IncidentPhotoLoader } from '../incident-photo/incident-photo';
import { OrderCard } from '../order-card/order-card';
import { PlacementSuggestion } from '../placement-suggestion/placement-suggestion';
import { RoundColumn, type StopShift } from '../round-column/round-column';
import {
  type Board,
  type BoardDrop,
  type BoardOrder,
  type BoardRound,
  cardTitleOf,
  dropTargetOf,
  needsGps,
  orderAriaOf,
  orderTagsOf,
  POOL_KEY,
  vehicleGroupsOf,
} from '../rounds-board-model';
import {
  alertTotalOf,
  carnetUrlOf,
  draggedTo,
  mapDashedOf,
  mapMutedOf,
  MAP_SCOPE_OPTIONS,
  mapNoteOf,
  mapRoundsOf,
  mapRowsOf,
  mapSubtitleOf,
  orderMetaOf,
  orderWindowOf,
  passageColumnTitle,
  passageNoteOf,
  poolSubtitleOf,
  putDropOf,
  SCOPE_ALL,
  SCOPE_VEHICLE,
  vehicleTabsOf,
} from '../rounds-board-view';

/** Ce que montre la colonne centrale : une lecture en cours, ratée, ou le tableau. */
export type BoardStatus = 'loading' | 'error' | 'ready';

/** Un geste sur une tournée, nommé par sa clé. */
export interface RoundGesture<T> {
  readonly key: string;
  readonly value: T;
}

const ALL = 'all';
const TAB_PREFIX = 'tab:';

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
    PlacementSuggestion,
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
  /** La place suggérée de chaque commande à répartir (CA7), par commande ; vide en aperçu. */
  readonly suggestions = input<ReadonlyMap<string, DeliveryPlacementSuggestionView>>(new Map());

  readonly dropped = output<BoardDrop>();
  readonly shifted = output<RoundGesture<StopShift>>();
  readonly removed = output<RoundGesture<string>>();
  readonly sorted = output<string>();
  readonly driverAssigned = output<RoundGesture<string>>();
  readonly driverRemoved = output<string>();
  readonly returned = output<string>();
  readonly printed = output<string>();
  readonly retry = output();
  /** « Placer ici » : la commande à poser à sa place suggérée (CA7). */
  readonly placed = output<string>();
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

  protected readonly tabs = computed(() => vehicleTabsOf(this.groups()));
  protected readonly allCount = computed(() => roundCountLabel(this.rounds().length));
  protected readonly allAlerts = computed(() => alertTotalOf(this.rounds()));

  /** Les tournées où « Mettre dans » peut envoyer une commande. */
  protected readonly openRounds = computed(() => this.rounds().filter((round) => !round.frozen));

  /** Ce que la carte regarde : toutes les tournées, ou celles du véhicule ouvert. */
  private readonly mains = computed(() => this.vehicleTab()?.rounds ?? this.rounds());

  protected readonly scopeOptions = MAP_SCOPE_OPTIONS;
  protected readonly scope = computed(() =>
    this.vehicleTab() === null || this.mapAll() ? SCOPE_ALL : SCOPE_VEHICLE,
  );

  protected readonly mapRounds = computed(() =>
    mapRoundsOf(this.scope() === SCOPE_ALL ? this.rounds() : this.mains()),
  );
  /** Les autres tournées, en pointillé à 40 %, quand un véhicule est ouvert sur « Toutes ». */
  protected readonly mapMuted = computed(() => mapMutedOf(this.rounds(), this.vehicleTab()));
  /** Le second passage du véhicule ouvert, en tirets. */
  protected readonly mapDashed = computed(() => mapDashedOf(this.vehicleTab()));

  protected readonly mapTitle = computed(
    () => this.vehicleTab()?.vehicleName ?? 'Toutes les tournées',
  );
  protected readonly mapSubtitle = computed(() =>
    mapSubtitleOf(this.mains(), this.departure(), this.vehicleTab() !== null),
  );

  protected readonly mapRows = computed(() =>
    mapRowsOf(this.mains(), this.vehicleTab() !== null, (vehicleId) => this.colorOf(vehicleId)),
  );

  protected readonly mapNote = computed(() => mapNoteOf(this.mains()));

  protected readonly poolSubtitle = computed(() => poolSubtitleOf(this.preview()));

  protected readonly titleOf = cardTitleOf;
  protected readonly tagsOf = orderTagsOf;
  protected readonly ariaOf = orderAriaOf;
  protected readonly shortRoundLabel = shortRoundLabel;
  protected readonly passageCountLabel = passageCountLabel;
  protected readonly needsGps = needsGps;

  protected readonly metaOf = orderMetaOf;
  protected readonly windowOf = orderWindowOf;

  protected colorOf(vehicleId: string): string {
    return this.colors().get(vehicleId) ?? 'var(--fold-color-text-muted)';
  }

  protected loadOf(vehicleId: string): string | null {
    return this.loadBadges().get(vehicleId) ?? null;
  }

  protected readonly columnTitle = passageColumnTitle;
  protected readonly passageNote = passageNoteOf;

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
    this.dropped.emit(putDropOf(order, index, round));
  }

  protected openCarnet(order: BoardOrder): void {
    const url = carnetUrlOf(order);
    if (url !== null) {
      void this.router.navigateByUrl(url);
    }
  }

  protected canOpenCarnet(order: BoardOrder): boolean {
    return this.canOpenClients() && order.sheet !== null && order.sheet.addressBook !== null;
  }

  /** Lâcher sur « À répartir » : seul un arrêt de tournée y retourne — retirer. */
  protected dropOnPool(event: CdkDragDrop<string, string, string>): void {
    if (event.previousContainer.data !== POOL_KEY) {
      this.dropped.emit(draggedTo(event, { list: POOL_KEY, index: event.currentIndex }));
    }
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
      this.dropped.emit(draggedTo(event, { list: target.key, index: target.stops.length }));
    }
    this.pickTab(vehicleId);
    this.mapAll.set(false);
  }

  protected dropOnRound(drop: BoardDrop): void {
    this.dropped.emit(drop);
  }
}
