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
  ElementRef,
  inject,
  input,
  output,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import type {
  DeliveryIncidentView,
  DeliveryPlacementSuggestionView,
  DeliveryRoundTransferStopView,
  SitePaletteEntryView,
} from '@lfd/contracts';
import type { FoldSelectOption, FoldViewToggleOption } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLinkComponent,
  FoldListboxComponent,
  FoldOptionComponent,
  FoldLoadingStateComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { DeliveryMap, type MapDeparture } from '../delivery-map/delivery-map';
import { passageCountLabel, roundCountLabel } from '../delivery-rounds';
import type { IncidentPhotoLoader } from '../incident-photo/incident-photo';
import { OrderCard } from '../order-card/order-card';
import { PlacementSuggestion } from '../placement-suggestion/placement-suggestion';
import { RoundColumn, type StopShift } from '../round-column/round-column';
import type { TransferStopMove } from '../transfer-stop-card/transfer-stop-card';
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
  ALL_FOCUS,
  BOARD_VIEW_OPTIONS,
  type BoardFocus,
  MAP_SCOPE_OPTIONS,
  VIEW_VEHICLE,
  mapRoundsOf,
  mapRowsOf,
  roundChoiceLabel,
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
  transferTargetsOf,
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
/**
 * La largeur de « À répartir », UNE pour toutes les vues de l'onglet (Hugo,
 * 2026-10-26) : un tiers du tableau environ, entre 260 et 360 px — le nom du
 * client et la référence y tiennent. À 1366 px dans le shell (~910 px de
 * tableau), ~275 px.
 */
/** Combien de temps « À répartir » se signale. */
const POOL_FLASH_MS = 1600;

export const POOL_INLINE_SIZE = 'clamp(16.25rem, 30%, 22.5rem)';

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
    FoldButtonIconComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLinkComponent,
    FoldListboxComponent,
    FoldOptionComponent,
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
  /** La palette des sites, lue par la page — la pastille de chaque arrêt (L1b). */
  readonly palette = input<readonly SitePaletteEntryView[]>([]);
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
  /**
   * La vue de l'onglet (Hugo, 2026-10-26) : « Toutes » sans carte, ou « Par
   * véhicule » — un véhicule, ses tournées et la carte en grand. La page la
   * tient dans l'adresse (`?vue=vehicule&vehicule=…`) ; le tableau la montre
   * et remonte chaque changement par {@link focusChange}.
   */
  readonly focus = input<BoardFocus>(ALL_FOCUS);

  readonly dropped = output<BoardDrop>();
  readonly shifted = output<RoundGesture<StopShift>>();
  readonly removed = output<RoundGesture<string>>();
  readonly sorted = output<string>();
  readonly driverAssigned = output<RoundGesture<string>>();
  readonly driverRemoved = output<string>();
  readonly returned = output<string>();
  readonly printed = output<string>();
  readonly retry = output();
  readonly focusChange = output<BoardFocus>();
  /** « Placer ici » : la commande à poser à sa place suggérée (CA7). */
  readonly placed = output<string>();
  /** Un dépôt sur l'onglet d'un véhicule qui n'a aucune tournée en préparation. */
  readonly noTarget = output<string>();
  /** Les gestes d'un arrêt de transfert interne (plan du transfert interne, §5). */
  readonly transferManifest = output<DeliveryRoundTransferStopView>();
  readonly transferRemoved = output<RoundGesture<string>>();
  readonly transferMoved = output<RoundGesture<TransferStopMove>>();

  /**
   * Où un arrêt de transfert de `round` peut aller : les AUTRES tournées
   * enregistrées et non parties. Rien en aperçu — la proposition ne porte pas
   * les transferts.
   */
  protected transferTargets(round: BoardRound): readonly FoldSelectOption<string>[] {
    if (this.preview()) {
      return [];
    }
    return transferTargetsOf(this.board()?.rounds ?? [], round.key);
  }

  protected readonly poolInlineSize = POOL_INLINE_SIZE;
  protected readonly poolKey = POOL_KEY;
  protected readonly tabPrefix = TAB_PREFIX;
  /** Posée tout de suite au geste, puis recalée sur ce que la page relit de l'adresse. */
  protected readonly current = linkedSignal(() => this.focus());
  /** La carte montre aussi les autres tournées, estompées. */
  protected readonly mapAll = linkedSignal(() => this.current().view !== VIEW_VEHICLE);
  protected readonly highlighted = signal<string | null>(null);
  /** « À répartir » se signale, le temps de {@link POOL_FLASH_MS}. */
  protected readonly poolFlash = signal(false);
  private readonly poolColumn = viewChild<ElementRef<HTMLElement>>('poolColumn');
  protected readonly tabOver = signal<string | null>(null);

  private readonly rounds = computed(() => this.board()?.rounds ?? []);
  protected readonly pool = computed(() => this.board()?.pool ?? []);
  protected readonly groups = computed(() => vehicleGroupsOf(this.rounds()));

  /**
   * Le véhicule regardé en « Par véhicule » : celui de l'adresse s'il roule ce
   * jour-là, sinon le premier. `null` sur « Toutes », ou sans aucun véhicule.
   */
  protected readonly vehicleTab = computed(() => {
    const focus = this.current();
    if (focus.view !== VIEW_VEHICLE) {
      return null;
    }
    const groups = this.groups();
    return groups.find((group) => group.vehicleId === focus.vehicleId) ?? groups[0] ?? null;
  });

  protected readonly viewOptions = BOARD_VIEW_OPTIONS;
  protected readonly view = computed(() => this.current().view);

  /** « 2 / 4 » entre les flèches, et leurs bornes : elles s'éteignent, sans boucler. */
  protected readonly vehicleIndex = computed(() => {
    const vehicle = this.vehicleTab();
    return vehicle === null ? -1 : this.groups().indexOf(vehicle);
  });

  protected readonly visibleGroups = computed(() => {
    const vehicle = this.vehicleTab();
    return vehicle === null ? this.groups() : [vehicle];
  });

  /** « Passage 1 / Passage 2 » : seulement quand le véhicule part plusieurs fois. */
  protected readonly passageOptions = computed<readonly FoldViewToggleOption[]>(() => {
    const rounds = this.vehicleTab()?.rounds ?? [];
    return rounds.length < 2
      ? []
      : rounds.map((round, index) => ({
          value: String(index + 1),
          label: roundChoiceLabel(round, rounds),
        }));
  });

  /** Le passage regardé, de 1 au nombre de passages ; un passage disparu retombe sur le premier. */
  protected readonly passage = computed(() => {
    const count = this.passageOptions().length;
    const asked = this.current().passage;
    return asked >= 1 && asked <= count ? asked : 1;
  });

  /** La tournée montrée seule, carte et liste ; `null` : un seul passage, ou « Toutes ». */
  protected readonly passageKey = computed(() =>
    this.passageOptions().length === 0
      ? null
      : (this.vehicleTab()?.rounds[this.passage() - 1]?.key ?? null),
  );

  /** « Toutes » sur la carte : une colonne de tous les arrêts, à la place des tournées. */
  protected readonly allStops = computed(
    () => this.vehicleTab() === null && this.current().view !== VIEW_VEHICLE && this.current().map,
  );
  /** La carte en grand : en « Par véhicule », ou en « Toutes » quand on l'a demandée. */
  protected readonly mapShown = computed(() => this.vehicleTab() !== null || this.allStops());
  protected readonly stopRows = computed(() =>
    mapRowsOf(this.rounds(), (vehicleId) => this.colorOf(vehicleId)),
  );

  protected readonly tabs = computed(() => vehicleTabsOf(this.groups()));
  protected readonly allCount = computed(() => roundCountLabel(this.rounds().length));
  protected readonly allAlerts = computed(() => alertTotalOf(this.rounds()));

  /** Les tournées où « Mettre dans » peut envoyer une commande. */
  protected readonly openRounds = computed(() => this.rounds().filter((round) => !round.frozen));
  /** Le sélecteur « Mettre dans » d'une commande à répartir : une option par tournée ouverte. */
  protected readonly placeOptions = computed(() =>
    this.openRounds().map((round) => ({
      value: round.key,
      label: roundChoiceLabel(round, this.rounds()),
      color: this.colorOf(round.vehicleId),
    })),
  );

  /** Ce que la carte regarde : toutes les tournées, ou celles du véhicule ouvert. */
  private readonly mains = computed(() => {
    const key = this.passageKey();
    const vehicle = this.vehicleTab()?.rounds ?? this.rounds();
    return key === null ? vehicle : vehicle.filter((round) => round.key === key);
  });

  protected readonly scopeOptions = MAP_SCOPE_OPTIONS;
  protected readonly scope = computed(() =>
    this.vehicleTab() === null || this.mapAll() ? SCOPE_ALL : SCOPE_VEHICLE,
  );

  protected readonly mapRounds = computed(() =>
    mapRoundsOf(this.scope() === SCOPE_ALL ? this.rounds() : this.mains()),
  );
  /** Les autres tournées, en pointillé à 40 %, quand un véhicule est ouvert sur « Toutes ». */
  protected readonly mapMuted = computed(() => {
    const key = this.passageKey();
    return key === null
      ? mapMutedOf(this.rounds(), this.vehicleTab())
      : new Set(
          this.rounds()
            .filter((round) => round.key !== key)
            .map((round) => round.key),
        );
  });
  /** Le second passage du véhicule ouvert, en tirets. */
  protected readonly mapDashed = computed(() =>
    this.passageKey() === null ? mapDashedOf(this.vehicleTab()) : new Set<string>(),
  );

  protected readonly mapTitle = computed(
    () => this.vehicleTab()?.vehicleName ?? 'Toutes les tournées',
  );
  protected readonly mapSubtitle = computed(() =>
    mapSubtitleOf(this.mains(), this.departure(), this.vehicleTab() !== null),
  );

  protected readonly poolSubtitle = computed(() => poolSubtitleOf(this.preview()));

  protected readonly titleOf = cardTitleOf;
  protected readonly tagsOf = orderTagsOf;
  protected readonly ariaOf = orderAriaOf;
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
    this.show(
      vehicleId === ALL ? ALL_FOCUS : { view: VIEW_VEHICLE, vehicleId, passage: 1, map: false },
    );
  }

  /** La bascule « Toutes » / « Par véhicule » ; le véhicule déjà choisi est gardé. */
  protected pickView(view: string): void {
    if (view === VIEW_VEHICLE) {
      this.show({
        view: VIEW_VEHICLE,
        vehicleId: this.current().vehicleId,
        passage: 1,
        map: false,
      });
    } else {
      this.pickTab(ALL);
    }
  }

  /**
   * « Les placer à la main » (encadré du plan arrêté) : la colonne « À
   * répartir » vient à l'écran et se signale brièvement.
   */
  highlightPool(): void {
    this.poolColumn()?.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    this.poolFlash.set(true);
    setTimeout(() => this.poolFlash.set(false), POOL_FLASH_MS);
  }

  /** « Afficher la carte » / « Afficher les tournées », en « Toutes ». */
  protected toggleMap(): void {
    this.show({ ...ALL_FOCUS, map: !this.current().map });
  }

  /** « Passage 1 / Passage 2 » : la tournée du véhicule montrée sur la carte et dans la liste. */
  protected pickPassage(value: string): void {
    const vehicle = this.vehicleTab();
    const passage = Number(value);
    if (vehicle !== null && Number.isInteger(passage)) {
      this.show({ view: VIEW_VEHICLE, vehicleId: vehicle.vehicleId, passage, map: false });
    }
  }

  /** ← → : le véhicule précédent ou suivant ; rien au-delà du premier ou du dernier. */
  protected stepVehicle(delta: number): void {
    const next = this.groups()[this.vehicleIndex() + delta];
    if (next !== undefined) {
      this.pickTab(next.vehicleId);
    }
  }

  private show(focus: BoardFocus): void {
    this.current.set(focus);
    this.focusChange.emit(focus);
  }

  /** Sans véhicule ouvert, « Ce véhicule » n'a rien à montrer : la carte reste sur toutes. */
  protected pickScope(value: string): void {
    this.mapAll.set(this.vehicleTab() === null || value === SCOPE_ALL);
  }

  /** « Mettre dans » : l'équivalent clavier du glisser, en fin de tournée. */
  /** « Mettre dans » : la tournée choisie au sélecteur. */
  protected putIn(order: BoardOrder, index: number, key: string): void {
    const round = this.openRounds().find((candidate) => candidate.key === key);
    if (round !== undefined) {
      this.put(order, index, round);
    }
  }

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
