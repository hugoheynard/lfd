import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { CustomerBankAccountView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { ClientBankAccount } from '../../client-bank-account.service';
import { ClientCompany } from '../../client-company.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';

/** Ce que la carte sait du RIB : pas encore lu, lecture ratée, ou lu. */
type BankState = 'loading' | 'failed' | 'ready';

/** Le pays proposé tant que rien n'est enregistré — celui de presque tous nos clients. */
const DEFAULT_COUNTRY = 'FR';

/**
 * **Le RIB de la société**, vu et déposé par le client
 * (plan `documentation/b2b/plan-rib-client.md`, lot B).
 *
 * Symétrique de la section RIB de la fiche client du back-office : les mêmes
 * champs, la même règle d'IBAN, la même phrase sur le titulaire. Ce qui diffère
 * est l'échec de lecture : le back-office le tait parce que le RIB y est un
 * à-côté de la fiche ; ici la carte n'a pas d'autre sujet, et un formulaire
 * vide après un échec ferait croire qu'aucun RIB n'existe.
 *
 * ## 🔴 L'IBAN ne revient jamais
 *
 * Le champ repart **vide** à chaque lecture, même quand un compte est
 * enregistré : l'API n'en rend que `last4`. Titulaire, adresse et BIC se
 * réaffichent — ce ne sont pas des secrets, et les relire avant de remplacer
 * est précisément ce qu'on veut.
 */
@Component({
  selector: 'app-bank-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './bank-card.html',
  styleUrl: './bank-card.scss',
})
export class BankCard {
  protected readonly t = inject(ClientCopyService).t;
  private readonly accounts = inject(ClientBankAccount);
  private readonly client = inject(ClientCompany);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<BankState>('loading');
  protected readonly account = signal<CustomerBankAccountView | null>(null);
  protected readonly busy = signal(false);

  protected readonly ibanDraft = signal('');
  protected readonly bicDraft = signal('');
  protected readonly holderDraft = signal('');
  protected readonly line1Draft = signal('');
  protected readonly line2Draft = signal('');
  protected readonly postalCodeDraft = signal('');
  protected readonly cityDraft = signal('');
  protected readonly countryDraft = signal(DEFAULT_COUNTRY);

  private readonly companyId = computed(() => this.client.company()?.id ?? null);

  constructor() {
    effect(() => {
      const id = this.companyId();
      if (id !== null) {
        void this.load(id);
      }
    });
  }

  /** « •••• 3041 · BIC CEPAFRPP751 · Refuge du Col SARL », ou la mention d'absence. */
  protected readonly saved = computed(() => {
    const account = this.account();
    const copy = this.t().account;
    return account === null
      ? copy.bankNone
      : fill(copy.bankSaved, { last4: account.last4, bic: account.bic, holder: account.holder });
  });

  /**
   * Le compte se recopie **en entier** — sauf le complément d'adresse,
   * facultatif sur un vrai RIB. Un compte à moitié rempli ne se découvrirait
   * qu'au rejet du prélèvement.
   */
  protected readonly canSave = computed(
    () =>
      this.ibanDraft().trim() !== '' &&
      this.bicDraft().trim() !== '' &&
      this.holderDraft().trim() !== '' &&
      this.line1Draft().trim() !== '' &&
      this.postalCodeDraft().trim() !== '' &&
      this.cityDraft().trim() !== '' &&
      this.countryDraft().trim().length === 2,
  );

  protected readonly submitLabel = computed(() =>
    this.account() === null ? this.t().account.bankSave : this.t().account.bankReplace,
  );

  protected retry(): void {
    const id = this.companyId();
    if (id !== null) {
      void this.load(id);
    }
  }

  protected async save(): Promise<void> {
    const id = this.companyId();
    if (id === null || !this.canSave() || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.accounts.save(id, {
        iban: this.ibanDraft().trim(),
        bic: this.bicDraft().trim(),
        holder: this.holderDraft().trim(),
        line1: this.line1Draft().trim(),
        line2: this.line2Draft().trim(),
        postalCode: this.postalCodeDraft().trim(),
        city: this.cityDraft().trim(),
        countryCode: this.countryDraft().trim().toUpperCase(),
      });
      this.notify.success(this.t().account.bankSavedToast);
      // Seul l'IBAN se vide : le reste se reprend de la lecture qui suit.
      this.ibanDraft.set('');
      await this.load(id);
    } catch (error) {
      this.notify.error(error, this.t().account.bankSaveFailed);
    } finally {
      this.busy.set(false);
    }
  }

  private async load(companyId: string): Promise<void> {
    try {
      const { account } = await this.accounts.read(companyId);
      this.account.set(account);
      if (account !== null) {
        this.fillDrafts(account);
      }
      this.state.set('ready');
    } catch {
      this.state.set('failed');
    }
  }

  private fillDrafts(account: CustomerBankAccountView): void {
    this.bicDraft.set(account.bic);
    this.holderDraft.set(account.holder);
    this.line1Draft.set(account.addressLine1);
    this.line2Draft.set(account.addressLine2);
    this.postalCodeDraft.set(account.postalCode);
    this.cityDraft.set(account.city);
    this.countryDraft.set(account.countryCode === '' ? DEFAULT_COUNTRY : account.countryCode);
  }
}
