import { CdkDrag, type CdkDragDrop, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { DeliveryIncidentView } from '@lfd/contracts';
import type { FoldSelectOption } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldDisclosureComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
} from 'fold-ng';

import { incidentCountLabel, incidentsOfRound, incidentsOfStop } from '../delivery-incidents';
import { parisTimeOf } from '../delivery-loading';
import { stopCountLabel, windowShortLabel } from '../delivery-rounds';
import { IncidentList } from '../incident-list/incident-list';
import type { IncidentPhotoLoader } from '../incident-photo/incident-photo';
import { OrderCard } from '../order-card/order-card';
import { RoundDriver } from '../round-driver/round-driver';
import {
  type BoardDrop,
  type BoardRound,
  type BoardStop,
  cardMetaOf,
  cardTitleOf,
  roundTimingLabel,
  stopAriaOf,
  stopEdgeOf,
  stopTagsOf,
  placeWarningLabel,
  unverifiedPlaceLabel,
} from '../rounds-board-model';

/** Un rang qui monte (−1) ou descend (+1) — l'équivalent clavier du glisser. */
export interface StopShift {
  readonly index: number;
  readonly delta: -1 | 1;
}

/**
 * **Une tournée** de l'organisateur (`handoff-tournees/SPEC.md`, § 3.3) :
 * l'état, le livreur, le compte d'arrêts, ce qui est à régler, puis les arrêts
 * — une liste où l'on dépose et d'où l'on prend.
 *
 * Elle n'écrit rien : chaque geste remonte, la page écrit et relit. Une
 * tournée partie est gelée (I6) : ni poignée, ni ↑ ↓, et un dépôt n'y est pas
 * remonté — la colonne dit pourquoi pendant qu'on survole.
 */
@Component({
  selector: 'app-round-column',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    CdkDragPlaceholder,
    CdkDropList,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldDisclosureComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    IncidentList,
    OrderCard,
    RoundDriver,
  ],
  templateUrl: './round-column.html',
  styleUrl: './round-column.scss',
})
export class RoundColumn {
  readonly round = input.required<BoardRound>();
  /** La couleur du véhicule. */
  readonly color = input.required<string>();
  /** « Passage 1 », « Tournée unique ». */
  readonly title = input.required<string>();
  /** « part en premier », « après le passage 1 » — `null` pour une tournée unique. */
  readonly passageNote = input<string | null>(null);
  readonly canWrite = input(false);
  /** Une écriture est en vol : les gestes attendent. */
  readonly busy = input(false);
  /** L'aperçu d'une proposition : rien ne s'écrit, le livreur ne se change pas. */
  readonly preview = input(false);
  readonly drivers = input<readonly FoldSelectOption<string>[]>([]);
  readonly highlighted = input<string | null>(null);
  readonly incidents = input<readonly DeliveryIncidentView[]>([]);
  readonly incidentPhoto = input.required<IncidentPhotoLoader>();

  readonly dropped = output<BoardDrop>();
  readonly shifted = output<StopShift>();
  readonly removed = output<string>();
  readonly sorted = output<void>();
  readonly driverAssigned = output<string>();
  readonly driverRemoved = output<void>();
  readonly returned = output<void>();
  readonly printed = output<void>();
  readonly hovered = output<string | null>();
  /** Un arrêt est pris (`true`), puis lâché (`false`). */
  readonly dragging = output<boolean>();

  /** Les gestes sur les arrêts : le droit, une tournée libre. */
  protected readonly movable = computed(() => this.canWrite() && !this.round().frozen);

  protected readonly state = computed(() => {
    const round = this.round();
    if (round.returnedAt !== null) {
      return { label: `Rentrée ${parisTimeOf(round.returnedAt)}`, variant: 'success' } as const;
    }
    if (round.departedAt !== null) {
      return { label: `Partie ${parisTimeOf(round.departedAt)}`, variant: 'info' } as const;
    }
    return round.frozen
      ? ({ label: 'Chargée', variant: 'neutral' } as const)
      : ({ label: 'En préparation', variant: 'neutral' } as const);
  });

  /** « Ranger par créneau » n'a de sens que si une fenêtre est intenable (C8). */
  protected readonly canSort = computed(
    () => this.movable() && this.round().stops.some((stop) => stop.windowClash !== null),
  );

  protected readonly roundIncidents = computed(() => {
    const id = this.round().roundId;
    return id === null ? [] : incidentsOfRound(this.incidents(), id);
  });

  protected readonly ariaLabel = computed(() => `${this.title()}, ${this.round().vehicleName}`);

  /** Départ, retour, distance — seulement quand le calcul les a rendus. */
  protected readonly timingLabel = computed(() => {
    const timing = this.round().timing;
    return timing === null ? null : roundTimingLabel(timing);
  });

  /** La proposition y a placé des commandes aux bacs inconnus : la place n'est pas contrôlée. */
  protected readonly unverifiedPlace = computed(() => unverifiedPlaceLabel(this.round()));
  protected readonly placeWarning = computed(() => placeWarningLabel(this.round()));

  protected readonly stopCountLabel = stopCountLabel;
  protected readonly incidentCountLabel = incidentCountLabel;
  protected readonly titleOf = cardTitleOf;
  protected readonly metaOf = (stop: BoardStop): string => cardMetaOf(stop.reference, stop.sheet);
  protected readonly windowOf = (stop: BoardStop): string => windowShortLabel(stop.window);
  protected readonly tagsOf = stopTagsOf;
  protected readonly edgeOf = stopEdgeOf;

  protected ariaOf(stop: BoardStop, index: number): string {
    return stopAriaOf(stop, index, this.round().frozen);
  }

  protected stopIncidents(stop: BoardStop): readonly DeliveryIncidentView[] {
    return stop.stopId === null ? [] : incidentsOfStop(this.incidents(), stop.stopId);
  }

  protected markOf(stop: BoardStop): 'placed' | 'proposed' | 'frozen' {
    if (this.round().frozen) {
      return 'frozen';
    }
    return stop.proposed ? 'proposed' : 'placed';
  }

  /** Un dépôt sur une tournée partie ne remonte pas : la carte revient d'où elle venait. */
  protected drop(event: CdkDragDrop<string, string, string>): void {
    if (this.round().frozen) {
      return;
    }
    this.dropped.emit({
      orderId: event.item.data,
      from: { list: event.previousContainer.data, index: event.previousIndex },
      to: { list: event.container.data, index: event.currentIndex },
    });
  }
}
