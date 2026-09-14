import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientBankAccount } from '../../../client-bank-account.service';
import { ClientCompany } from '../../../client-company.service';
import { ClientMandate } from '../../../client-mandate.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { CardFoot } from '../../card-foot/card-foot';
import { BankPanel } from '../bank-panel/bank-panel';
import { bankActionLabel, bankLine } from '../bank-section';

/**
 * La carte **RIB** en pile : « RIB enregistré · •••• 1906 » ou son absence, et
 * le bouton pleine largeur qui ouvre le panneau.
 *
 * La lecture est PARTAGÉE (`ClientBankAccount`) : les deux cartes sont dans le
 * DOM, et un échec de lecture se dit — montré comme « aucun RIB », il ferait
 * croire qu'il n'en existe pas.
 */
@Component({
  selector: 'app-bank-mobile-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardFoot, FoldButtonComponent, FoldEmptyStateComponent, FoldLoadingStateComponent],
  templateUrl: './bank-mobile-card.html',
  styleUrl: './bank-mobile-card.scss',
})
export class BankMobileCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly accounts = inject(ClientBankAccount);
  private readonly mandates = inject(ClientMandate);
  private readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  private readonly companyId = computed(() => this.client.company()?.id ?? null);

  protected readonly line = computed(() => bankLine(this.accounts.account(), this.t().account));
  protected readonly action = computed(() =>
    bankActionLabel(this.accounts.account(), this.t().account),
  );

  constructor() {
    effect(() => {
      const id = this.companyId();
      if (id !== null) {
        this.accounts.ensure(id);
      }
    });
  }

  protected retry(): void {
    const id = this.companyId();
    if (id !== null) {
      void this.accounts.reload(id);
    }
  }

  protected open(): void {
    const id = this.companyId();
    if (id !== null) {
      void BankPanel.open(this.panels, this.accounts, this.mandates, id);
    }
  }
}
