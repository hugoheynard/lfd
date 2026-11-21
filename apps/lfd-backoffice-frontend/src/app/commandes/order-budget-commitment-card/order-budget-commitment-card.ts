import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { AdminOrderView, BudgetCommitmentRequirementsView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldPanelHostService,
} from 'fold-ng';
import { SectionTitle } from '@lfd/b2b-ui/order';

import {
  BudgetCommitmentDialog,
  type BudgetCommitmentDialogData,
} from '../budget-commitment-dialog/budget-commitment-dialog';
import { AdminOrdersService } from '../orders.service';

/** Ce que la carte lit de la commande. */
export type BudgetCommitmentOrder = Pick<
  AdminOrderView,
  'id' | 'orderNumber' | 'companyId' | 'settlement' | 'budgetCommitment'
>;

/** Ce que la carte sait du payeur : pas encore lu, lu, ou illisible. */
type RequirementsState =
  | { readonly kind: 'none' }
  | { readonly kind: 'ready'; readonly requirements: BudgetCommitmentRequirementsView }
  | { readonly kind: 'failed' };

/**
 * **L'engagement budgétaire de la commande** (plan clients publics,
 * § 6 quater) : le numéro du bon de commande et le code service, et le geste
 * « Corriger l'engagement » pour un organisme public.
 *
 * Le payeur ne se lit que pour une commande au compte d'une société — un
 * organisme public règle toujours au compte. La carte paraît pour un payeur
 * public, ou dès que la commande porte un engagement ; rien sinon.
 */
@Component({
  selector: 'app-order-budget-commitment-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SectionTitle,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
  ],
  templateUrl: './order-budget-commitment-card.html',
})
export class OrderBudgetCommitmentCard {
  readonly order = input.required<BudgetCommitmentOrder>();
  /** La correction est enregistrée : la fiche se relit. */
  readonly corrected = output();

  private readonly orders = inject(AdminOrdersService);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly payer = signal<RequirementsState>({ kind: 'none' });

  protected readonly commitment = computed(() => this.order().budgetCommitment);

  /** Le payeur est un organisme public : le geste de correction est proposé. */
  protected readonly publicPayer = computed(() => {
    const payer = this.payer();
    return payer.kind === 'ready' && payer.requirements.publicPayer;
  });

  protected readonly shown = computed(
    () => this.publicPayer() || this.commitment() !== undefined || this.payer().kind === 'failed',
  );

  constructor() {
    effect(() => {
      const order = this.order();
      const companyId = order.companyId;
      untracked(() => {
        if (companyId === null || order.settlement !== 'account') {
          this.payer.set({ kind: 'none' });
          return;
        }
        void this.read(companyId);
      });
    });
  }

  protected correct(): void {
    const payer = this.payer();
    const order = this.order();
    const data: BudgetCommitmentDialogData = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      current: order.budgetCommitment,
      requirements: payer.kind === 'ready' ? payer.requirements : null,
    };
    const ref = this.panels.open<BudgetCommitmentDialogData, boolean>(BudgetCommitmentDialog, {
      data,
    });
    void ref.closed.then((saved) => {
      if (saved === true) {
        this.corrected.emit();
      }
    });
  }

  private async read(companyId: string): Promise<void> {
    try {
      const requirements = await this.orders.budgetCommitmentRequirements(companyId);
      this.payer.set({ kind: 'ready', requirements });
    } catch {
      this.payer.set({ kind: 'failed' });
    }
  }
}
