import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldSpinnerComponent,
} from 'fold-ng';

import {
  type PlannedRound,
  type PlannedStop,
  plannedRoundTitle,
  stopCompanyOf,
  stopFlags,
  stopNameOf,
  stopPlaceOf,
} from '../delivery-planning';
import { distanceLabel, durationLabel, keptReasonLabel } from '../delivery-routing';
import { stopCountLabel } from '../delivery-rounds';
import { timeLabel } from '../run-sheet';

/** Le type de donnée du glisser : une place de la composition, jamais du texte du client. */
export const STOP_DRAG_TYPE = 'application/x-lfd-planned-stop';

/**
 * **La feuille de route d'une camionnette** dans l'écran « Planifier »
 * (lot 10 bis, L10b-C1, C2) : le départ, chaque arrêt — heure, nom du client,
 * lieu, créneau, et ce qui cloche écrit sur la ligne —, puis le retour.
 *
 * Elle ne décide rien : elle dit qu'on a pris un arrêt, et où on l'a lâché.
 * Une tournée partie ou chargée ne se prend pas et ne reçoit rien (I6).
 */
@Component({
  selector: 'app-round-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldCardComponent, FoldElementTitleComponent, FoldSpinnerComponent],
  templateUrl: './round-sheet.html',
  styleUrl: './round-sheet.scss',
})
export class RoundSheet {
  readonly round = input.required<PlannedRound>();
  /** Le token fold de la couleur du véhicule. */
  readonly color = input.required<string>();
  readonly departureLabel = input.required<string>();
  /** Glisser est permis (droit et pas d'autre geste en vol) ; le verrou s'y ajoute. */
  readonly editable = input(false);
  /** La colonne est en train d'être re-chronométrée. */
  readonly pending = input(false);
  readonly highlighted = input<string | null>(null);

  readonly hovered = output<string | null>();
  /** On a pris l'arrêt de ce rang. */
  readonly picked = output<number>();
  /** On a lâché ici, au rang donné (avant l'arrêt qui l'occupe). */
  readonly dropped = output<number>();

  protected readonly draggable = computed(() => this.editable() && this.round().lock === null);
  protected readonly swatch = computed(() => this.color());

  protected readonly title = computed(() => plannedRoundTitle(this.round()));

  protected readonly facts = computed(() => {
    const round = this.round();
    const count = stopCountLabel(round.stops.length);
    return round.timing === null
      ? count
      : [count, distanceLabel(round.timing.meters), durationLabel(round.timing.minutes)].join(
          ' · ',
        );
  });

  protected readonly departureTime = computed(() => {
    const timing = this.round().timing;
    return timing === null ? '—' : timeLabel(timing.departureTime);
  });
  protected readonly returnTime = computed(() => {
    const timing = this.round().timing;
    return timing === null ? '—' : timeLabel(timing.returnTime);
  });

  protected readonly status = computed(() => {
    const round = this.round();
    if (round.lock === 'departed') {
      return { label: 'Partie · ne bouge plus', variant: 'neutral' } as const;
    }
    if (round.lock === 'loaded') {
      return { label: 'Chargée · ne bouge plus', variant: 'neutral' } as const;
    }
    if (round.touched) {
      return { label: 'Modifiée', variant: 'info' } as const;
    }
    return round.keptReason === null
      ? ({ label: 'Proposée', variant: 'accent' } as const)
      : ({ label: `Gardée · ${keptReasonLabel(round.keptReason)}`, variant: 'neutral' } as const);
  });

  protected readonly flags = stopFlags;
  protected readonly timeLabel = timeLabel;
  protected readonly nameOf = stopNameOf;
  protected readonly companyOf = stopCompanyOf;
  protected readonly placeOf = stopPlaceOf;

  /** « créneau 8 h 00 – 10 h 00 », ou « sans créneau ». */
  protected windowOf(stop: PlannedStop): string {
    const window = stop.window;
    if (window === null) {
      return 'sans créneau';
    }
    return window.start === null
      ? `créneau avant ${timeLabel(window.end)}`
      : `créneau ${timeLabel(window.start)} – ${timeLabel(window.end)}`;
  }

  protected pick(event: DragEvent, index: number): void {
    if (!this.draggable()) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData(STOP_DRAG_TYPE, String(index));
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = 'move';
    }
    this.picked.emit(index);
  }

  /** Autoriser le lâcher : seulement un arrêt de l'écran, sur une tournée libre. */
  protected over(event: DragEvent): void {
    if (this.draggable() && event.dataTransfer?.types.includes(STOP_DRAG_TYPE) === true) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  }

  /** Sur une ligne : avant elle si on lâche sur sa moitié haute, après sinon. */
  protected dropOnStop(event: DragEvent, index: number): void {
    if (!this.accepts(event)) {
      return;
    }
    event.stopPropagation();
    const target = event.currentTarget;
    const after =
      target instanceof HTMLElement &&
      event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
    this.dropped.emit(after ? index + 1 : index);
  }

  /** Ailleurs dans la colonne : à la fin. */
  protected dropAtEnd(event: DragEvent): void {
    if (this.accepts(event)) {
      this.dropped.emit(this.round().stops.length);
    }
  }

  private accepts(event: DragEvent): boolean {
    if (!this.draggable() || event.dataTransfer?.types.includes(STOP_DRAG_TYPE) !== true) {
      return false;
    }
    event.preventDefault();
    return true;
  }
}
