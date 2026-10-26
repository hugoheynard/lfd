import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type ParamMap, Router } from '@angular/router';
import { map } from 'rxjs';
import type {
  DeliveryPlacementSuggestionView,
  DeliveryRoundTransferStopView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldPopoverTriggerDirective,
  FoldToastComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { DayVersionWatcher } from '../../shared/day-version/day-version-watcher';
import { DayReadinessBanner } from '../day-readiness-banner/day-readiness-banner';
import type { MapDeparture } from '../delivery-map/delivery-map';
import { vehicleColors } from '../delivery-planning';
import { vehiclesActiveOn } from '../delivery-rounds';
import { DeliveryIncidentsService } from '../delivery-incidents.service';
import { modeLabel } from '../delivery-routing';
import { canReadDeliverySettings } from '../delivery-settings-access';
import type { IncidentPhotoLoader } from '../incident-photo/incident-photo';
import { type PlannerResult, PlannerPopover } from '../planner-popover/planner-popover';
import type { StopShift } from '../round-column/round-column';
import { RoundPdf } from '../round-pdf';
import { boardSummaryOf, newRoundChoicesOf, plannerVehiclesOf } from '../round-vehicle-choices';
import { type BoardDrop, roundKmLabel } from '../rounds-board-model';
import { type RoundGesture, RoundsBoard } from '../rounds-board/rounds-board';
import { ALL_FOCUS, type BoardFocus, VIEW_ALL, VIEW_VEHICLE } from '../rounds-board-view';
import { RoundsDay } from '../rounds-day';
import { parisDayOf } from '../run-sheet';
import { RoundsDayWriter } from '../rounds-day-writer';
import { RoundsLayoutGestures } from '../rounds-layout-gestures';
import { CompositionGapsCallout } from '../composition-gaps-callout/composition-gaps-callout';
import { RoundsPreview } from '../rounds-preview';
import { SitePaletteStore } from '../../shared/logistics-colors/site-palette.store';
import { RoundsSettingsReads } from '../rounds-settings-reads';
import { DeliveryRoutingService } from '../delivery-routing.service';
import { TourManagerSummary } from '../tour-manager/tour-manager-summary';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  TransferManifestDialog,
  type TransferManifestDialogData,
} from '../transfer-manifest-dialog/transfer-manifest-dialog';
import type { TransferStopMove } from '../transfer-stop-card/transfer-stop-card';

/** Le temps de lire le bandeau et de se raviser. */
const UNDO_MS = 8000;
/** La vue de l'onglet — `?vue=vehicule` ; absent : « Toutes ». */
const VIEW_QUERY_PARAM = 'vue';
/** Le véhicule regardé en « Par véhicule » — `?vehicule=<id>` ; absent : le premier. */
const VEHICLE_QUERY_PARAM = 'vehicule';
/** Le passage regardé quand le véhicule part plusieurs fois — `?passage=2` ; absent : le premier. */
const PASSAGE_QUERY_PARAM = 'passage';
/** En « Toutes », la carte et tous les arrêts — `?carte=1`. */
const MAP_QUERY_PARAM = 'carte';

function boardFocusOf(params: ParamMap): BoardFocus {
  return params.get(VIEW_QUERY_PARAM) === VIEW_VEHICLE
    ? {
        view: VIEW_VEHICLE,
        vehicleId: params.get(VEHICLE_QUERY_PARAM),
        passage: Number(params.get(PASSAGE_QUERY_PARAM) ?? 1),
        map: false,
      }
    : { ...ALL_FOCUS, map: params.get(MAP_QUERY_PARAM) === '1' };
}

/**
 * **Livraison › Organisation de tournées** — l'organisateur (`handoff-tournees/SPEC.md`) :
 * répartir les livraisons d'un jour entre les véhicules, puis ranger chaque
 * tournée, dans un seul tableau à trois colonnes.
 *
 * La lecture du jour vit dans {@link RoundsDay} (composition et feuille de
 * route relues ensemble, C16), les écritures dans {@link RoundsDayWriter}.
 *
 * Un geste (glisser, « Mettre dans », ↑ ↓, retirer, ranger) devient les
 * listes visées ({@link GestureOutcome}) ; la page en tire les affectations,
 * déplacements et retraits, puis envoie chaque permutation ENTIÈRE (I2). Il
 * s'annule en renvoyant les listes d'avant. Aucune écriture n'est rejouée.
 *
 * « Proposer » remplit le même tableau en aperçu ({@link RoundsPreview}) :
 * rien n'est écrit avant « Appliquer ».
 */
@Component({
  selector: 'app-rounds-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    RoundsPreview,
    RoundsDay,
    RoundsDayWriter,
    RoundsLayoutGestures,
    RoundsSettingsReads,
    RoundPdf,
  ],
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldPageLayoutComponent,
    FoldPopoverTriggerDirective,
    FoldToastComponent,
    CompositionGapsCallout,
    DayReadinessBanner,
    PlannerPopover,
    RoundsBoard,
  ],
  templateUrl: './rounds-page.html',
  styleUrl: './rounds-page.scss',
})
export class RoundsPage {
  private readonly incidentsService = inject(DeliveryIncidentsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly read = inject(RoundsDay);
  private readonly writer = inject(RoundsDayWriter);
  private readonly pdf = inject(RoundPdf);
  private readonly gestures = inject(RoundsLayoutGestures);
  private readonly reads = inject(RoundsSettingsReads);
  private readonly panels = inject(FoldPanelHostService);
  protected readonly preview = inject(RoundsPreview);
  /** La palette des sites — la pastille de chaque arrêt (plan du tri et des couleurs, L1b). */
  protected readonly palette = inject(SitePaletteStore);

  protected readonly day = this.read.day;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  /** La vue de l'onglet, relue de l'adresse : un rechargement garde la vue et le véhicule. */
  protected readonly focus = toSignal(this.route.queryParamMap.pipe(map(boardFocusOf)), {
    initialValue: boardFocusOf(this.route.snapshot.queryParamMap),
  });

  protected readonly state = this.read.state;
  /** La dernière lecture finie : le bandeau du plan arrêté se relit une fois par lecture. */
  protected readonly lastLoad = this.read.lastLoad;
  private readonly reload = signal(0);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_rounds:write'));
  /**
   * Le jour est passé, à Paris — la même référence que le bandeau : on n'y
   * compose plus. « Nouvelle tournée », « Plus d'options » et les gestes de
   * placement de l'encadré sont masqués (Hugo, 2026-10-26) ; retirer, rentrer,
   * affecter un livreur restent permis.
   */
  protected readonly past = computed(() => this.day() < parisDayOf(new Date()));
  /** Composer : le droit, sur un jour qui n'est pas passé. */
  protected readonly canCompose = computed(() => this.canWrite() && !this.past());
  /** Le panneau « Proposer les tournées » — le bandeau du plan arrêté peut l'ouvrir (CA6a). */
  private readonly routing = inject(DeliveryRoutingService);
  private readonly boardView = viewChild(RoundsBoard);
  /** « Les placer automatiquement » est en vol. */
  protected readonly autoPlacing = signal(false);
  /** Le refus du calcul, dit dans l'encadré du plan arrêté. */
  protected readonly autoRefusal = linkedSignal<string | null>(() => {
    this.day();
    return null;
  });
  private readonly summaries = inject(TourManagerSummary, { optional: true });
  protected readonly canReadSettings = computed(() =>
    canReadDeliverySettings((permission) => this.permissions.can(permission)),
  );
  protected readonly canSeePhotos = computed(() =>
    this.permissions.can('delivery_procedures:read'),
  );

  protected readonly refusal = this.writer.refusal;
  protected readonly busy = this.writer.busy;
  protected readonly toast = this.gestures.toast;

  protected readonly fleetUnreadable = this.reads.fleetUnreadable;
  protected readonly driversUnreadable = this.reads.driversUnreadable;
  protected readonly driverOptions = this.reads.driverOptions;

  /** Le départ des tournées, lu dans les réglages ; `null` : pas de carte. */
  protected readonly departure = computed<MapDeparture | null>(
    () => this.preview.proposal()?.departurePoint ?? this.reads.departurePoint(),
  );
  /** En aperçu, « À répartir » est celui de la proposition : aucune suggestion n'y vaut. */
  protected readonly shownSuggestions = computed(() =>
    this.preview.active()
      ? new Map<string, DeliveryPlacementSuggestionView>()
      : this.read.suggestions(),
  );

  protected readonly pdfFailed = this.pdf.failed;
  protected readonly blockedPdfUrl = this.pdf.blockedUrl;
  protected readonly blockedPdfName = this.pdf.blockedFileName;

  protected readonly incidents = this.read.incidents;
  /** La photo d'un signalement, par la route de l'admin (`delivery_rounds`). */
  protected readonly incidentPhoto: IncidentPhotoLoader = (incidentId) =>
    this.incidentsService.photo(incidentId);

  protected readonly composed = this.read.composed;

  /** Ce que montre le tableau : l'aperçu s'il y en a un, sinon la composition. */
  protected readonly board = this.gestures.board;

  private readonly activeVehicles = computed(() => {
    const fleet = this.reads.fleet();
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

  protected readonly loadBadges = this.reads.loadBadges;

  protected readonly newRoundChoices = computed(() =>
    newRoundChoicesOf(
      this.activeVehicles(),
      this.composed()?.rounds ?? [],
      this.colors(),
      this.loadBadges(),
    ),
  );

  protected readonly plannerVehicles = computed(() =>
    plannerVehiclesOf(this.activeVehicles(), this.composed()?.rounds ?? [], this.colors()),
  );

  protected readonly summary = computed(() => boardSummaryOf(this.board()));

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

  protected readonly kmLabel = roundKmLabel;
  protected readonly undoMs = UNDO_MS;

  constructor() {
    // « 4 tournées · 20 arrêts » monte au bandeau de Tour manager (2026-10-26).
    effect(() => {
      const summaries = this.summaries;
      if (summaries !== null && this.board() !== null) {
        summaries.publish(this.day(), this.summary().rounds);
      }
    });
    effect(() => {
      const day = this.day();
      this.reload();
      untracked(() => {
        void this.read.load(day);
        // Relue à chaque ouverture et chaque jour choisi : une couleur changée
        // en Réglages › Sites se voit au prochain affichage.
        void this.palette.refresh();
      });
    });
    // Ne relire que si la journée de la livraison a bougé — un autre poste a
    // composé, un livreur est parti (`plan-version-par-journee.md`, D4).
    // L'écran s'ouvre sous `delivery_rounds:read`, la porte de la version aussi.
    inject(DayVersionWatcher).watch({
      journals: ['delivery'],
      date: () => this.day(),
      reload: () => this.read.load(this.read.day()),
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
          void this.reads.loadFleet();
          void this.reads.loadDrivers();
        });
      }
    });
    effect(() => {
      if (this.canReadSettings()) {
        untracked(() => void this.reads.loadDeparture());
      }
    });
  }

  /**
   * « Toutes » / « Par véhicule » et le véhicule regardé, fusionnés à l'adresse
   * (le `?jour=` reste), en `replaceUrl` comme le jour : un rechargement garde
   * la vue, Précédent ne rejoue pas chaque flèche.
   */
  protected showFocus(focus: BoardFocus): void {
    const vehicle = focus.view === VIEW_VEHICLE;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        [VIEW_QUERY_PARAM]: vehicle ? VIEW_VEHICLE : VIEW_ALL,
        [VEHICLE_QUERY_PARAM]: vehicle ? focus.vehicleId : null,
        [PASSAGE_QUERY_PARAM]: vehicle && focus.passage > 1 ? focus.passage : null,
        [MAP_QUERY_PARAM]: !vehicle && focus.map ? 1 : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  // ─── Les gestes du tableau ─────────────────────────────────────────────

  protected readonly onDrop = (drop: BoardDrop): void => this.gestures.drop(drop);
  protected readonly onShift = (gesture: RoundGesture<StopShift>): void =>
    this.gestures.shift(gesture.key, gesture.value);
  protected readonly onRemove = (gesture: RoundGesture<string>): void =>
    this.gestures.remove(gesture.key, gesture.value);
  protected readonly onSort = (key: string): void => this.gestures.sort(key);
  protected readonly undo = (): void => this.gestures.undo();
  protected readonly dismissToast = (id: number): void => this.gestures.dismiss(id);

  protected noTarget(vehicleName: string): void {
    this.gestures.showToast(`${vehicleName} : aucune tournée en préparation.`, null);
  }

  /** « Placer ici » (CA7) : à la place suggérée, sous la version lue avec elle. */
  protected readonly placeSuggested = (orderId: string): Promise<boolean> =>
    this.writer.placeSuggested(orderId);

  // ─── Les arrêts de transfert interne (plan du transfert interne, §5) ──

  protected openManifest(stop: DeliveryRoundTransferStopView): void {
    this.panels.open<TransferManifestDialogData, void>(TransferManifestDialog, {
      data: { transferId: stop.transferId, siteLabel: stop.siteLabel },
    });
  }

  protected readonly removeTransferStop = (gesture: RoundGesture<string>): Promise<boolean> =>
    this.writer.removeTransferStop(gesture.key, gesture.value);
  protected readonly moveTransferStop = (
    gesture: RoundGesture<TransferStopMove>,
  ): Promise<boolean> =>
    this.writer.moveTransferStop(gesture.key, gesture.value.stopId, gesture.value.toKey);

  // ─── La tournée elle-même ──────────────────────────────────────────────

  protected readonly openRound = (vehicleId: string): Promise<boolean> =>
    this.writer.openRound(vehicleId);
  protected readonly assignDriver = (gesture: RoundGesture<string>): Promise<boolean> =>
    this.writer.assignDriver(gesture.key, gesture.value);
  protected readonly unassignDriver = (key: string): Promise<boolean> =>
    this.writer.unassignDriver(key);
  protected readonly returnToDepot = (key: string): Promise<boolean> =>
    this.writer.returnToDepot(key);
  protected readonly print = (roundId: string): Promise<void> => this.pdf.print(roundId);

  // ─── L'aperçu d'une proposition ────────────────────────────────────────

  protected showProposal(result: PlannerResult): void {
    this.toast.set(null);
    this.refusal.set(null);
    this.preview.show(result.proposal, this.composed(), result.recomposed);
  }

  /**
   * « Les placer automatiquement » : la même proposition que le panneau, en
   * `insert` (garde ce qui est placé, ajoute le reste), sans l'ouvrir. Proposer
   * est une lecture ; l'aperçu attend « Valider ».
   */
  protected async autoPlace(): Promise<void> {
    if (this.autoPlacing() || this.busy()) {
      return;
    }
    const day = this.day();
    this.autoPlacing.set(true);
    this.autoRefusal.set(null);
    try {
      const proposal = await this.routing.propose({
        day,
        vehicleIds: null,
        recomposeAll: false,
        mode: 'insert',
      });
      if (day === this.day()) {
        this.showProposal({ proposal, recomposed: false });
      }
    } catch (error) {
      this.autoRefusal.set(httpErrorMessage(error, 'La proposition n’a pas pu être calculée.'));
    } finally {
      this.autoPlacing.set(false);
    }
  }

  /** « Les placer à la main » : chaque commande à répartir a son sélecteur de tournée. */
  protected placeByHand(): void {
    this.boardView()?.highlightPool();
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
    if (this.canApply()) {
      await this.gestures.applyProposal();
    }
  }
}
