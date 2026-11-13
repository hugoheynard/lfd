import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { type LegalEntityView, TRANSFER_DUE_DAYS_MAX, TRANSFER_DUE_DAYS_MIN } from '@lfd/contracts';
import { FoldButtonComponent, FoldNumberInputComponent, FoldPageSectionComponent } from 'fold-ng';

import { LegalEntitiesService } from '../../../legal-entities.service';

/**
 * **L'échéance des factures au virement** : N jours après l'émission, 15 par
 * défaut, au plus 45 (décisions de Hugo du 2026-11-13,
 * `documentation/comptabilite/le-paiement-par-virement.md`).
 *
 * Carte à part, voisine du prélèvement : ce délai n'a rien à voir avec la
 * pré-notification SEPA, et le glisser sous « Enregistrer » du calendrier
 * en referait un réglage du prélèvement.
 *
 * L'échéance est figée sur la facture à l'émission : enregistrer ne touche
 * que les factures émises ensuite.
 */
@Component({
  selector: 'app-transfer-due-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageSectionComponent, FoldButtonComponent, FoldNumberInputComponent],
  templateUrl: './transfer-due-card.html',
  styleUrl: './transfer-due-card.scss',
})
export class TransferDueCard {
  private readonly api = inject(LegalEntitiesService);

  readonly entity = input.required<LegalEntityView>();
  readonly busy = input(false);

  /** Ce que le geste a fait, pour que la page relise et annonce. */
  readonly saved = output<{ readonly action: () => Promise<unknown>; readonly said: string }>();

  protected readonly minDays = TRANSFER_DUE_DAYS_MIN;
  protected readonly maxDays = TRANSFER_DUE_DAYS_MAX;

  protected readonly daysDraft = signal<number | null>(null);

  protected readonly outOfRange = computed(() => {
    const days = this.daysDraft();
    return days === null || !Number.isInteger(days) || days < this.minDays || days > this.maxDays;
  });

  /** Un délai inchangé n'est pas un fait : le bouton ne réécrit pas la même valeur. */
  protected readonly unchanged = computed(
    () => this.daysDraft() === this.entity().transferDueDaysAfterIssue,
  );

  constructor() {
    effect(() => {
      this.daysDraft.set(this.entity().transferDueDaysAfterIssue);
    });
  }

  protected save(): void {
    const days = this.daysDraft();
    if (days === null || this.outOfRange() || this.unchanged()) {
      return;
    }
    const id = this.entity().id;
    this.saved.emit({
      action: () => this.api.setTransferDueDays(id, { days }),
      said: 'Échéance des factures au virement enregistrée.',
    });
  }
}
