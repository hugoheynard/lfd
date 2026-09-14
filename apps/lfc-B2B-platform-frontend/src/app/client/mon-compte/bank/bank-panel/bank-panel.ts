import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { CustomerBankAccountView, SetCompanyBankAccountPayload } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { ClientBankAccount } from '../../../client-bank-account.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';
import { bankActionLabel, bankLine } from '../bank-section';

/** Le pays proposé tant que rien n'est enregistré — celui de presque tous nos clients. */
const DEFAULT_COUNTRY = 'FR';

/** Charge d'ouverture : la société, et le compte que la carte vient de lire. */
export interface BankPanelData {
  readonly companyId: string;
  readonly account: CustomerBankAccountView | null;
}

/**
 * Le panneau **RIB** de `/mon-compte` — le formulaire que la carte portait.
 *
 * Symétrique de la section RIB de la fiche client du back-office : les mêmes
 * champs, la même règle d'IBAN, la même phrase sur le titulaire, dite AVANT
 * les champs.
 *
 * ## 🔴 L'IBAN ne revient jamais
 *
 * Le champ s'ouvre **vide**, même quand un compte est enregistré : l'API n'en
 * rend que `last4`. Titulaire, adresse et BIC se reprennent — ce ne sont pas
 * des secrets, et les relire avant de remplacer est précisément ce qu'on veut.
 *
 * Un refus reste affiché ici, sous les champs à corriger ; un succès ferme le
 * panneau avec `true`, et {@link BankPanel.open} relit le RIB partagé.
 */
@Component({
  selector: 'app-bank-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './bank-panel.html',
  styleUrl: './bank-panel.scss',
})
export class BankPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  /**
   * Ouvre le panneau sur le RIB déjà lu, et **relit** au succès : la réponse
   * d'écriture ne porte rien, seule la relecture dit les quatre derniers
   * chiffres — aux deux cartes à la fois, puisqu'elles lisent la même source.
   */
  static async open(
    panels: FoldPanelHostService,
    accounts: ClientBankAccount,
    companyId: string,
  ): Promise<void> {
    const ref = panels.open<BankPanelData, boolean>(BankPanel, {
      side: panelSide(),
      data: { companyId, account: accounts.account() },
    });
    if ((await ref.closed) === true) {
      await accounts.reload(companyId);
    }
  }

  readonly data = input.required<BankPanelData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly accounts = inject(ClientBankAccount);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly ibanDraft = signal('');
  protected readonly bicDraft = signal('');
  protected readonly holderDraft = signal('');
  protected readonly line1Draft = signal('');
  protected readonly line2Draft = signal('');
  protected readonly postalCodeDraft = signal('');
  protected readonly cityDraft = signal('');
  protected readonly countryDraft = signal(DEFAULT_COUNTRY);

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const account = this.data().account;
      untracked(() => {
        if (account !== null) {
          this.fillDrafts(account);
        }
      });
    });
  }

  /** « RIB enregistré · •••• 3041 », ou l'absence — l'en-tête dit ce qu'on remplace. */
  protected readonly saved = computed(() => bankLine(this.data().account, this.t().account));

  /**
   * Le compte se recopie **en entier** — sauf le complément d'adresse,
   * facultatif sur un vrai RIB. Un compte à moitié rempli ne se découvrirait
   * qu'au rejet du prélèvement.
   */
  protected readonly canSave = computed(
    () =>
      !this.saving() &&
      this.ibanDraft().trim() !== '' &&
      this.bicDraft().trim() !== '' &&
      this.holderDraft().trim() !== '' &&
      this.line1Draft().trim() !== '' &&
      this.postalCodeDraft().trim() !== '' &&
      this.cityDraft().trim() !== '' &&
      this.countryDraft().trim().length === 2,
  );

  protected readonly submitLabel = computed(() =>
    bankActionLabel(this.data().account, this.t().account),
  );

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const refusal = await this.accounts.save(this.data().companyId, this.payload());
    this.saving.set(false);
    if (refusal === null) {
      this.notify.success(this.t().account.bankSavedToast);
      this.ref.close(true);
    } else {
      this.refusal.set(refusal);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }

  private payload(): SetCompanyBankAccountPayload {
    return {
      iban: this.ibanDraft().trim(),
      bic: this.bicDraft().trim(),
      holder: this.holderDraft().trim(),
      line1: this.line1Draft().trim(),
      line2: this.line2Draft().trim(),
      postalCode: this.postalCodeDraft().trim(),
      city: this.cityDraft().trim(),
      countryCode: this.countryDraft().trim().toUpperCase(),
    };
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
