import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DELIVERY_INCIDENT_NOTE_MAX, type DeliveryIncidentFamily } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldListboxComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { familyOptions, reasonOptions } from '../delivery-incidents';
import { MyDeliveryRoundService } from '../my-delivery-round.service';

/** L'arrêt en cours, qu'un problème de la tournée peut noter (§ 3 : « s'il y en a un »). */
export interface CurrentStopRef {
  readonly stopId: string;
  readonly label: string;
}

/**
 * **Déclarer un problème** (`documentation/livraisons/plan-a-la-porte.md`, § 3) —
 * une famille, un motif de la liste du contrat, une note bornée, une photo
 * facultative prise par l'appareil.
 *
 * Deux montages : sur un arrêt, la famille « à la remise » et l'arrêt fixé ;
 * dans l'en-tête de la tournée, les familles technique et routière, l'arrêt en
 * cours noté si le livreur le coche. Le serveur refuse ce qui ne va pas
 * ensemble ; son refus s'affiche tel quel et le formulaire reste ouvert.
 */
@Component({
  selector: 'app-incident-report-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldListboxComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './incident-report-form.html',
  styleUrl: './incident-report-form.scss',
})
export class IncidentReportForm {
  private readonly service = inject(MyDeliveryRoundService);

  readonly roundId = input.required<string>();
  readonly families = input.required<readonly DeliveryIncidentFamily[]>();
  /** L'arrêt du signalement, fixé — ou `null` : la tournée. */
  readonly stopId = input<string | null>(null);
  /** L'arrêt en cours, proposé à cocher pour un problème de la tournée. */
  readonly currentStop = input<CurrentStopRef | null>(null);

  /** Le signalement est enregistré. */
  readonly reported = output();
  readonly cancelled = output();

  protected readonly noteMax = DELIVERY_INCIDENT_NOTE_MAX;

  private readonly chosenFamily = signal<DeliveryIncidentFamily | null>(null);
  protected readonly reason = signal<string | null>(null);
  protected readonly note = signal('');
  protected readonly photo = signal<File | null>(null);
  protected readonly linkCurrent = signal(false);
  protected readonly sending = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly familyChoices = computed(() => familyOptions(this.families()));
  /** Une seule famille proposée : elle est prise d'office. */
  protected readonly family = computed(() => {
    const [only, ...others] = this.families();
    return others.length === 0 && only !== undefined ? only : this.chosenFamily();
  });
  protected readonly reasonChoices = computed(() => {
    const family = this.family();
    return family === null ? [] : reasonOptions(family);
  });
  protected readonly noteTooLong = computed(() => this.note().length > this.noteMax);
  protected readonly noteHint = computed(
    () => `${String(this.note().length)} / ${String(this.noteMax)} caractères`,
  );
  protected readonly canSend = computed(
    () =>
      !this.sending() && this.family() !== null && this.reason() !== null && !this.noteTooLong(),
  );

  protected pickFamily(family: DeliveryIncidentFamily | null): void {
    this.chosenFamily.set(family);
    // Un motif d'une autre famille serait refusé : on le retire.
    this.reason.set(null);
  }

  protected pickPhoto(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.photo.set(target.files?.item(0) ?? null);
    }
  }

  protected removePhoto(): void {
    this.photo.set(null);
  }

  protected async send(): Promise<void> {
    const family = this.family();
    const reason = this.reason();
    if (!this.canSend() || family === null || reason === null) {
      return;
    }
    this.sending.set(true);
    this.refusal.set(null);
    try {
      await this.service.report(this.roundId(), {
        family,
        reason,
        note: this.note().trim(),
        stopId: this.stopId() ?? (this.linkCurrent() ? (this.currentStop()?.stopId ?? null) : null),
        photo: this.photo(),
      });
      this.reported.emit();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le problème n’a pas pu être signalé.'));
    } finally {
      this.sending.set(false);
    }
  }
}
