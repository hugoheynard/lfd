import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { DeliveryPlacementSuggestionView } from '@lfd/contracts';
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
import { DAY_OPTIONS } from '../day-choice';
import { DayReadinessBanner } from '../day-readiness-banner/day-readiness-banner';
import type { MapDeparture } from '../delivery-map/delivery-map';
import { vehicleColors } from '../delivery-planning';
import { serviceDayLabel, vehiclesActiveOn } from '../delivery-rounds';
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
import { RoundsDay } from '../rounds-day';
import { RoundsDayWriter } from '../rounds-day-writer';
import { RoundsLayoutGestures } from '../rounds-layout-gestures';
import { RoundsPreview } from '../rounds-preview';
import { RoundsSettingsReads } from '../rounds-settings-reads';

/** Le temps de lire le bandeau et de se raviser. */
const UNDO_MS = 8000;

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
  private readonly incidentsService = inject(DeliveryIncidentsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly read = inject(RoundsDay);
  private readonly writer = inject(RoundsDayWriter);
  private readonly pdf = inject(RoundPdf);
  private readonly gestures = inject(RoundsLayoutGestures);
  private readonly reads = inject(RoundsSettingsReads);
  protected readonly preview = inject(RoundsPreview);

  protected readonly dayOptions = DAY_OPTIONS;
  protected readonly day = this.read.day;
  protected readonly dayChoice = this.read.dayChoice;

  protected readonly state = this.read.state;
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

  protected readonly dayLabel = computed(() => serviceDayLabel(this.day()));
  protected readonly kmLabel = roundKmLabel;
  protected readonly undoMs = UNDO_MS;

  constructor() {
    effect(() => {
      const day = this.day();
      this.reload();
      untracked(() => void this.read.load(day));
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

  protected readonly pickChoice = (value: string): void => this.read.pickChoice(value);
  protected readonly pickDate = (value: string): void => this.read.pickDate(value);

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
