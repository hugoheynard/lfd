import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { IssuedInvoiceSummaryView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { day, euros } from '../../comptabilite/invoice-dossier-format';
import { kindLabel } from '../../comptabilite/issued-invoice-format';
import { IssuedInvoicesService } from '../../comptabilite/issued-invoices.service';

/**
 * **« Facture et avoirs »** sur la fiche d'une commande (plan
 * `facture-carte-et-remboursements.md`) : la facture qui porte
 * le bon — carte ou du mois — et les avoirs qui la corrigent, chacun mené à
 * sa pièce dans la comptabilité.
 *
 * Rien n'est rendu sans pièce, comme les remboursements : la carte n'existe
 * que si elle a quelque chose à dire. Sous `b2b_accounting:read` : sans ce
 * droit, elle ne rend rien et n'appelle rien — le serveur refuserait, et une
 * carte en erreur sur chaque commande ressemblerait à une panne.
 */
@Component({
  selector: 'app-order-invoices-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './order-invoices-card.html',
  styleUrl: './order-invoices-card.scss',
})
export class OrderInvoicesCard {
  readonly orderId = input.required<string>();

  private readonly service = inject(IssuedInvoicesService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly invoices = signal<readonly IssuedInvoiceSummaryView[]>([]);
  protected readonly loadError = signal(false);

  protected readonly euros = euros;
  protected readonly day = day;
  protected readonly kind = kindLabel;

  constructor() {
    effect(() => {
      const id = this.orderId();
      const allowed = this.permissions.can('b2b_accounting:read');
      untracked(() => {
        if (allowed) {
          void this.load(id);
        }
      });
    });
  }

  protected retry(): void {
    void this.load(this.orderId());
  }

  private async load(orderId: string): Promise<void> {
    this.loadError.set(false);
    try {
      this.invoices.set((await this.service.ofOrder(orderId)).invoices);
    } catch {
      this.loadError.set(true);
    }
  }
}
