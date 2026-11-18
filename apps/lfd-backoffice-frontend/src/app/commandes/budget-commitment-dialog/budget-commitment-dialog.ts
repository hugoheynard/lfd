import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import type { BudgetCommitmentRequirementsView, BudgetCommitmentView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { budgetCommitmentGaps } from '../budget-commitment';
import { BudgetCommitmentFields } from '../budget-commitment-fields/budget-commitment-fields';
import { AdminOrdersService } from '../orders.service';

/** Ce que la fiche confie au dialogue. */
export interface BudgetCommitmentDialogData {
  readonly orderId: string;
  readonly orderNumber: string;
  /** L'engagement que porte la commande, absent sans engagement. */
  readonly current: BudgetCommitmentView | undefined;
  readonly requirements: BudgetCommitmentRequirementsView | null;
}

/**
 * **Corriger l'engagement budgétaire** d'une commande (plan clients publics,
 * E3′) — un geste à part de la modification : un numéro manquant se découvre
 * souvent après la livraison. Tant que la commande n'est pas facturée ; au-delà,
 * le serveur refuse (`budget_commitment.already_invoiced`) et son message reste
 * dans le dialogue, tel quel.
 *
 * Deux champs vides retirent l'engagement (`null`) — refusé, lui aussi, si le
 * payeur l'exige. Se ferme sur `true` quand la correction est enregistrée.
 */
@Component({
  selector: 'app-budget-commitment-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BudgetCommitmentFields,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './budget-commitment-dialog.html',
})
export class BudgetCommitmentDialog {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<BudgetCommitmentDialogData>();

  private readonly ref = inject(FoldPanelRef<boolean>);
  private readonly orders = inject(AdminOrdersService);
  private readonly notify = inject(NotifyService);

  protected readonly number = linkedSignal(() => this.data().current?.number ?? '');
  /** Le code porté, sinon celui que la fiche Chorus propose. */
  protected readonly serviceCode = linkedSignal(
    () => this.data().current?.serviceCode ?? this.data().requirements?.defaultServiceCode ?? '',
  );
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** Ce qui manque, dit avant l'envoi ; le serveur reste juge. */
  protected readonly gaps = computed(() =>
    budgetCommitmentGaps(this.data().requirements, this.number(), this.serviceCode()),
  );

  /** Enregistrer n'est cliquable que si quelque chose a changé. */
  protected readonly modified = computed(
    () =>
      this.number().trim() !== (this.data().current?.number ?? '') ||
      this.serviceCode().trim() !== (this.data().current?.serviceCode ?? ''),
  );

  protected cancel(): void {
    this.ref.close();
  }

  protected async save(): Promise<void> {
    if (this.saving() || !this.modified()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const { orderId, orderNumber } = this.data();
    const number = this.number().trim();
    const serviceCode = this.serviceCode().trim();
    try {
      await this.orders.correctBudgetCommitment(orderId, {
        budgetCommitment: number === '' && serviceCode === '' ? null : { number, serviceCode },
      });
      this.notify.success(`Engagement de la commande ${orderNumber} corrigé.`);
      this.ref.close(true);
    } catch (error) {
      // Le message du serveur, tel quel : « déjà facturée : faites un avoir »,
      // « ce payeur exige un numéro »…
      this.refusal.set(httpErrorMessage(error, 'L’engagement n’a pas été corrigé.'));
    } finally {
      this.saving.set(false);
    }
  }
}
