import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { MintBlocker } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent, FoldPanelHostService } from 'fold-ng';

import { ClientBankAccount } from '../../../client-bank-account.service';
import { ClientCompany } from '../../../client-company.service';
import { ClientMandate } from '../../../client-mandate.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { BankPanel } from '../../bank/bank-panel/bank-panel';
import { IdentityPanel } from '../../identity/identity-panel/identity-panel';

/** Les mentions qui se saisissent dans l'identité légale. */
const IDENTITY_BLOCKERS: ReadonlySet<MintBlocker> = new Set([
  'company_name_missing',
  'siren_missing',
]);

/** Les mentions qui se saisissent dans le RIB. */
const BANK_BLOCKERS: ReadonlySet<MintBlocker> = new Set([
  'bank_account_missing',
  'holder_legal_form_missing',
]);

/**
 * **Ce qui manque pour générer le mandat**, nommé, avec le geste qui ouvre le
 * dialogue où chaque mention se saisit — l'identité légale (raison sociale,
 * SIREN) ou le RIB (le compte, la civilité ou forme juridique du titulaire).
 *
 * Les codes viennent du serveur (`mintBlockers`), calculés par la fonction même
 * qui refuse la génération : le composant traduit, il ne recompte rien.
 * `issuer_missing` n'a pas de geste — c'est de notre côté —, il se dit.
 *
 * Après un dialogue fermé sur un succès, le mandat et ses mentions se relisent
 * (`ClientMandate.refresh`) : la liste se vide sous les yeux.
 */
@Component({
  selector: 'app-mandate-blockers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './mandate-blockers.html',
  styleUrl: './mandate-blockers.scss',
})
export class MandateBlockers {
  /** Les mentions manquantes, telles que le serveur les rend. */
  readonly blockers = input.required<readonly MintBlocker[]>();
  /** Vrai dans un panneau : le dialogue s'empile au-dessus au lieu de le remplacer. */
  readonly stack = input(false);

  protected readonly t = inject(ClientCopyService).t;
  private readonly client = inject(ClientCompany);
  private readonly accounts = inject(ClientBankAccount);
  private readonly mandates = inject(ClientMandate);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly lines = computed(() => {
    const labels = this.t().account.mandateBlockers;
    return this.blockers().map((code) => ({ code, label: labels[code] }));
  });

  protected readonly needsIdentity = computed(() =>
    this.blockers().some((code) => IDENTITY_BLOCKERS.has(code)),
  );
  protected readonly needsBank = computed(() =>
    this.blockers().some((code) => BANK_BLOCKERS.has(code)),
  );

  protected async openIdentity(): Promise<void> {
    const company = this.client.company();
    if (company !== null && (await IdentityPanel.open(this.panels, company, this.stack()))) {
      await this.mandates.refresh(company.id);
    }
  }

  /** `BankPanel.open` relit déjà le RIB et le mandat, mentions comprises, au succès. */
  protected async openBank(): Promise<void> {
    const company = this.client.company();
    if (company !== null) {
      await BankPanel.open(this.panels, this.accounts, this.mandates, company.id, this.stack());
    }
  }
}
