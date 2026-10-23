import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { BankReturnChecksService } from '../../bank-return-checks.service';
import { day } from '../../invoice-dossier-format';

/** Le jour dont on retire le contrôle, et son entité. */
export interface WithdrawReturnCheckPanelData {
  readonly legalEntityId: string;
  readonly day: string;
}

/** La raison d'un retrait tient en une phrase (le serveur borne à 500). */
const NOTE_MAX = 500;

/**
 * **Retirer « Retours contrôlés »** (plan `plan-page-procedure-de-prelevement.md`
 * § 1.2) : une attestation fausse ne s'efface pas, elle se retire par une
 * ligne de plus — et un retrait dit pourquoi.
 */
@Component({
  selector: 'app-withdraw-return-check-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './withdraw-return-check-panel.html',
  styleUrl: './withdraw-return-check-panel.scss',
})
export class WithdrawReturnCheckPanel {
  private readonly api = inject(BankReturnChecksService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<WithdrawReturnCheckPanelData | undefined>(undefined);

  protected readonly note = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly subtitle = computed(() => {
    const target = this.data();
    return target === undefined ? '' : `Le contrôle du ${day(target.day)}`;
  });

  protected readonly canSubmit = computed(() => {
    const said = this.note().trim();
    return said !== '' && said.length <= NOTE_MAX && !this.saving();
  });

  protected async submit(): Promise<void> {
    const target = this.data();
    if (target === undefined || !this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.withdraw(target.legalEntityId, target.day, this.note().trim());
      this.ref.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Le contrôle n’a pas pu être retiré.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
