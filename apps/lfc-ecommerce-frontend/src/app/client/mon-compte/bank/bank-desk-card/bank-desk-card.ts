import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { CompletionCallout } from '../../completion/completion-callout/completion-callout';
import type { CompletionItem, CompletionTarget } from '../../completion/completion-items';
import { ClientBankAccount } from '../../../client-bank-account.service';
import { ClientCompany } from '../../../client-company.service';
import { ClientMandate } from '../../../client-mandate.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { BankPanel } from '../bank-panel/bank-panel';
import { bankActionLabel, bankLine } from '../bank-section';

/**
 * La carte **RIB** du bureau : « RIB enregistré · •••• 1906 » ou son absence,
 * et le bouton qui ouvre le formulaire dans son panneau — il ne revient pas
 * dans la carte.
 *
 * La lecture est PARTAGÉE (`ClientBankAccount`) : les deux cartes sont dans le
 * DOM, et un échec de lecture se dit — montré comme « aucun RIB », il ferait
 * croire qu'il n'en existe pas.
 */
@Component({
  selector: 'app-bank-desk-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CompletionCallout,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './bank-desk-card.html',
  styleUrl: './bank-desk-card.scss',
})
export class BankDeskCard {
  /** Ce qui manque dans cette carte (plan `plan-mon-compte-a-completer.md` §2.3) — la page le calcule. */
  readonly completion = input<readonly CompletionItem[]>([]);
  /** Compléter un élément : la page ouvre le dialogue de sa cible, le même que la synthèse du haut. */
  readonly completionAction = output<CompletionTarget>();

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
