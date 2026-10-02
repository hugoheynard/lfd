import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  DeliveryDriverView,
  DeliveryIncidentView,
  DeliveryRoundOrderRef,
  DeliveryRoundStopView,
  DeliveryRoundView,
  DeliveryRunSheetStopView,
  VehicleView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import type { FoldSelectOption, FoldViewToggleOption } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDateComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { canReadDeliverySettings } from '../delivery-settings-access';
import { parisTimeOf } from '../delivery-loading';
import { incidentCountLabel, incidentsOfRound, incidentsOfStop } from '../delivery-incidents';
import { DeliveryIncidentsService } from '../delivery-incidents.service';
import { DeliveryRoundsService } from '../delivery-rounds.service';
import { IncidentList } from '../incident-list/incident-list';
import type { IncidentPhotoLoader } from '../incident-photo/incident-photo';
import { DeliverySettingsService } from '../delivery-settings.service';
import {
  broughtBackLabel,
  type ComposedDay,
  type ComposedRound,
  composeDay,
  roundLabel,
  serviceDayLabel,
  shiftedOrder,
  signalLabel,
  stopCountLabel,
  vehiclesActiveOn,
} from '../delivery-rounds';
import {
  DAY_QUERY_PARAM,
  dayOfQuery,
  isServiceDay,
  parisDayOf,
  shiftDay,
  stopTitleOf,
  windowLabel,
} from '../run-sheet';
import { RunSheetService } from '../run-sheet.service';
import { RoundDriver } from '../round-driver/round-driver';
import { RoutePlanner } from '../route-planner/route-planner';
import { RunSheetStop } from '../run-sheet-stop/run-sheet-stop';
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

const TODAY = '0';
const TOMORROW = '1';

/** Ce qu'on dit quand le serveur refuse une composition devenue périmée, sans phrase à lui. */
const CHANGED = 'La composition a changé entre-temps : elle vient d’être relue.';
const CONFLICT = 409;

/**
 * **Composer les tournées d'un jour** — répartir les livraisons entre les
 * véhicules, puis ordonner chaque tournée
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 3, C9).
 *
 * La composition ne porte que des références ; le détail d'un arrêt est celui
 * de la feuille de route. Les deux sont relues **ensemble**, au même moment,
 * et jointes par commande (C16) : jamais une jointure entre deux instants.
 *
 * On choisit la tournée dans une liste, on ne glisse pas : au téléphone comme
 * au clavier. Monter et descendre envoient la permutation complète.
 *
 * Aucune écriture n'est rejouée : un refus parce que la composition a changé
 * (409) s'affiche et relit ; tout autre refus s'affiche tel quel.
 */
@Component({
  selector: 'app-rounds-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDateComponent,
    FoldDisclosureComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
    IncidentList,
    RoundDriver,
    RoutePlanner,
    RunSheetStop,
  ],
  templateUrl: './rounds-page.html',
  styleUrl: './rounds-page.scss',
})
export class RoundsPage {
  private readonly rounds = inject(DeliveryRoundsService);
  private readonly incidentsService = inject(DeliveryIncidentsService);
  private readonly runSheet = inject(RunSheetService);
  private readonly settings = inject(DeliverySettingsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly injector = inject(Injector);

  private readonly today = parisDayOf(new Date());

  protected readonly dayOptions: readonly FoldViewToggleOption[] = [
    { value: TODAY, label: 'Aujourd’hui' },
    { value: TOMORROW, label: 'Demain' },
  ];

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Le jour de l'URL (`?jour=`) s'il est lisible, sinon demain. */
  protected readonly day = signal(
    dayOfQuery(this.route.snapshot.queryParamMap.get(DAY_QUERY_PARAM)) ?? shiftDay(this.today, 1),
  );
  protected readonly dayChoice = computed(() => {
    const day = this.day();
    if (day === this.today) {
      return TODAY;
    }
    return day === shiftDay(this.today, 1) ? TOMORROW : '';
  });

  protected readonly state = signal<ComposeState>({ status: 'loading' });
  private readonly reload = signal(0);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_rounds:write'));
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

  private readonly fleet = signal<FleetState>(null);
  protected readonly fleetUnreadable = computed(() => this.fleet() === 'error');
  protected readonly chosenVehicle = signal<string | null>(null);

  /** Les livreurs affectables (MT-D2 v2) — lus seulement pour qui compose. */
  private readonly drivers = signal<readonly DeliveryDriverView[] | 'error' | null>(null);
  protected readonly driversUnreadable = computed(() => this.drivers() === 'error');
  protected readonly driverOptions = computed<readonly FoldSelectOption<string>[]>(() => {
    const drivers = this.drivers();
    return Array.isArray(drivers)
      ? drivers.map((driver) => ({ value: driver.staffUserId, label: driver.name }))
      : [];
  });

  /** La tournée qu'on imprime : seule elle est rendue sur papier. */
  protected readonly printing = signal<string | null>(null);

  private readonly incidents = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.incidents : [];
  });
  /** La photo d'un signalement, par la route de l'admin (`delivery_rounds`). */
  protected readonly incidentPhoto: IncidentPhotoLoader = (incidentId) =>
    this.incidentsService.photo(incidentId);
  protected readonly incidentCountLabel = incidentCountLabel;

  protected roundIncidents(roundId: string): readonly DeliveryIncidentView[] {
    return incidentsOfRound(this.incidents(), roundId);
  }

  protected stopIncidents(stopId: string): readonly DeliveryIncidentView[] {
    return incidentsOfStop(this.incidents(), stopId);
  }

  protected readonly composed = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.composed : null;
  });

  /**
   * Les tournées où l'on peut encore affecter ou déplacer : une tournée partie
   * est gelée (lot 4, I6) — le serveur refuse, l'écran ne la propose pas.
   */
  protected readonly roundOptions = computed<readonly FoldSelectOption<string>[]>(() =>
    (this.composed()?.rounds ?? [])
      .filter(({ round }) => round.departedAt === null)
      .map(({ round }) => ({
        value: round.id,
        label: roundLabel(round),
      })),
  );

  protected readonly vehicleOptions = computed<readonly FoldSelectOption<string>[]>(() => {
    const fleet = this.fleet();
    return Array.isArray(fleet)
      ? vehiclesActiveOn(fleet, this.day()).map((vehicle) => ({
          value: vehicle.id,
          label: vehicle.name,
        }))
      : [];
  });

  /** Le chargement de chaque véhicule connu, par identifiant — lecture seule (L2b-C3). */
  private readonly loadBadges = computed(() => {
    const fleet = this.fleet();
    return new Map(
      Array.isArray(fleet)
        ? fleet.map((vehicle) => [vehicle.id, vehicleBadgeLabel(vehicle)] as const)
        : [],
    );
  });

  /**
   * « 5,5 m³ ❄ » dans l'en-tête d'une tournée. Aucune capacité n'est comparée
   * aux commandes : le calcul n'a pas de volume de commande (L2b-C4).
   */
  protected loadBadge(vehicleId: string): string | null {
    return this.loadBadges().get(vehicleId) ?? null;
  }

  protected readonly printedRound = computed(() => {
    const id = this.printing();
    return this.composed()?.rounds.find(({ round }) => round.id === id) ?? null;
  });

  /**
   * La société de chaque commande, lue sur la feuille de route jointe : le
   * calculateur y renvoie pour compléter un point GPS dans le carnet.
   */
  protected readonly companies = computed(() => {
    const composed = this.composed();
    const lines = [
      ...(composed?.unassigned ?? []),
      ...(composed?.rounds.flatMap((round) => round.stops) ?? []),
    ];
    return new Map(
      lines.flatMap(({ sheet }) =>
        sheet?.addressBook ? [[sheet.orderId, sheet.addressBook.companyId] as const] : [],
      ),
    );
  });

  protected readonly dayLabel = computed(() => serviceDayLabel(this.day()));

  protected readonly roundLabel = roundLabel;
  protected readonly timeOf = parisTimeOf;
  protected readonly stopCountLabel = stopCountLabel;
  protected readonly signalLabel = signalLabel;
  protected readonly broughtBackLabel = broughtBackLabel;
  protected readonly windowLabel = windowLabel;

  /** Un numéro par lecture : une réponse lente d'un autre jour n'écrase pas la bonne. */
  private request = 0;

  constructor() {
    effect(() => {
      const day = this.day();
      this.reload();
      untracked(() => void this.load(day));
    });
    effect(() => {
      if (this.canWrite()) {
        untracked(() => {
          void this.loadFleet();
          void this.loadDrivers();
        });
      }
    });
  }

  protected pickChoice(value: string): void {
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

  /** « CMD-12 · Le Comptoir » — la référence seule quand la feuille du jour ne la connaît pas. */
  protected titleOf(reference: string, sheet: DeliveryRunSheetStopView | null): string {
    return sheet === null ? reference : `${reference} · ${stopTitleOf(sheet)}`;
  }

  /** « 8 h 00 – 10 h 00 · horaire par défaut », ou ce qui manque. */
  protected windowOf(sheet: DeliveryRunSheetStopView | null): string {
    if (sheet === null) {
      return 'Absente de la feuille de route du jour';
    }
    const label = windowLabel(sheet.window);
    return sheet.window?.source === 'default' ? `${label} · horaire par défaut` : label;
  }

  /** L'adresse sur une ligne : première ligne et ville. */
  protected shortAddressOf(sheet: DeliveryRunSheetStopView | null): string | null {
    const address = sheet?.address;
    return address === null || address === undefined
      ? null
      : `${address.ligne1}, ${address.codePostal} ${address.ville}`;
  }

  protected openRound(): Promise<void> {
    const vehicleId = this.chosenVehicle();
    if (vehicleId === null) {
      return Promise.resolve();
    }
    return this.write(async () => {
      await this.rounds.open({ day: this.day(), vehicleId });
      this.chosenVehicle.set(null);
    }, 'La tournée n’a pas pu être ouverte.');
  }

  protected assign(order: DeliveryRoundOrderRef, roundId: string): Promise<void> {
    const target = this.roundById(roundId);
    if (target === null) {
      return Promise.resolve();
    }
    return this.write(
      () => this.rounds.assign(roundId, { orderId: order.orderId, version: target.version }),
      'La commande n’a pas pu être affectée.',
    );
  }

  protected move(
    from: DeliveryRoundView,
    stop: DeliveryRoundStopView,
    toRoundId: string,
  ): Promise<void> {
    const target = this.roundById(toRoundId);
    if (target === null || toRoundId === from.id) {
      return Promise.resolve();
    }
    return this.write(
      () =>
        this.rounds.move(from.id, stop.stopId, {
          toRoundId,
          fromVersion: from.version,
          toVersion: target.version,
        }),
      'L’arrêt n’a pas pu être déplacé.',
    );
  }

  protected shift(composed: ComposedRound, index: number, delta: -1 | 1): Promise<void> {
    const stopIds = shiftedOrder(
      composed.stops.map(({ stop }) => stop.stopId),
      index,
      delta,
    );
    if (stopIds === null) {
      return Promise.resolve();
    }
    return this.write(
      () =>
        this.rounds.reorder(composed.round.id, {
          stopIds: [...stopIds],
          version: composed.round.version,
        }),
      'L’ordre n’a pas pu être enregistré.',
    );
  }

  protected remove(round: DeliveryRoundView, stop: DeliveryRoundStopView): Promise<void> {
    return this.write(
      () => this.rounds.remove(round.id, stop.stopId, { version: round.version }),
      'L’arrêt n’a pas pu être retiré.',
    );
  }

  /** Affecter un livreur (MT-D2) ; une tournée partie est refusée par le serveur, qui le dit. */
  protected assignDriver(round: DeliveryRoundView, staffUserId: string): Promise<void> {
    return this.write(
      () => this.rounds.assignDriver(round.id, { staffUserId, version: round.version }),
      'Le livreur n’a pas pu être affecté.',
    );
  }

  protected unassignDriver(round: DeliveryRoundView): Promise<void> {
    return this.write(
      () => this.rounds.unassignDriver(round.id, { version: round.version }),
      'Le livreur n’a pas pu être retiré.',
    );
  }

  /** « Déclarer rentrée » (PL2) — quand le livreur a oublié, ou qu'aucun n'était affecté. */
  protected returnToDepot(round: DeliveryRoundView): Promise<void> {
    return this.write(
      () => this.rounds.returnToDepot(round.id),
      'La tournée n’a pas pu être déclarée rentrée.',
    );
  }

  protected print(roundId: string): void {
    this.printing.set(roundId);
    afterNextRender(
      () => {
        window.print();
        this.printing.set(null);
      },
      { injector: this.injector },
    );
  }

  private roundById(id: string): DeliveryRoundView | null {
    return this.composed()?.rounds.find(({ round }) => round.id === id)?.round ?? null;
  }

  private async write(gesture: () => Promise<void>, fallback: string): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await gesture();
      await this.load(this.day());
    } catch (error) {
      // Un 409 dit que la composition affichée est périmée. Jamais un nouvel
      // essai en silence : il écraserait ce qu'un collègue vient de faire.
      const changed = error instanceof HttpErrorResponse && error.status === CONFLICT;
      this.refusal.set(httpErrorMessage(error, changed ? CHANGED : fallback));
      // Relire dans tous les cas : une liste restée sur le choix refusé
      // mentirait sur la tournée de l'arrêt.
      await this.load(this.day());
    } finally {
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
      // C16 : les deux lectures partent ensemble, et l'une sans l'autre n'est rien.
      const [rounds, sheet] = await Promise.all([this.rounds.day(day), this.runSheet.day(day)]);
      if (request === this.request) {
        this.state.set({
          status: 'ready',
          day,
          composed: composeDay(rounds, sheet),
          incidents: rounds.incidents,
        });
      }
    } catch {
      if (request === this.request) {
        this.state.set({ status: 'error' });
      }
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
