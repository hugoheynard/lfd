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
import {
  BankAccountForm,
  bankAccountDraftChanged,
  bankAccountDraftFrom,
  EMPTY_BANK_ACCOUNT_DRAFT,
  hasCountryCode,
  holderLegalFormFits,
  holderLegalFormProvided,
  isBankAccountComplete,
  toBankAccountPayload,
  type BankAccountDraft,
} from '@lfd/b2b-ui/payment';
import type { CustomerBankAccountView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { ClientBankAccount } from '../../../client-bank-account.service';
import { ClientMandate } from '../../../client-mandate.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { dialogSide } from '../../../panel-side';
import { bankActionLabel, bankLine } from '../bank-section';

/** Charge d'ouverture : la société, et le compte que la carte vient de lire. */
export interface BankPanelData {
  readonly companyId: string;
  readonly account: CustomerBankAccountView | null;
}

/**
 * Le panneau **RIB** de `/mon-compte` — le formulaire que la carte portait.
 *
 * Symétrique de la section RIB de la fiche client du back-office, et plus que
 * symétrique depuis le 2026-09-14 : les champs sont `lfd-bank-account-form` de
 * `@lfd/b2b-ui/payment`, le MÊME formulaire, et leurs règles vivent dans
 * `bank-account-draft.model.ts`. Ce panneau garde son cadre, sa phrase sur le
 * titulaire dite AVANT les champs, et son écriture par `ClientBankAccount`.
 *
 * ## 🔴 L'IBAN ne revient jamais
 *
 * Le champ s'ouvre **vide**, même quand un compte est enregistré : l'API n'en
 * rend que `last4`. Titulaire, adresse et BIC se reprennent — ce ne sont pas
 * des secrets, et les relire avant de remplacer est précisément ce qu'on veut.
 *
 * Un refus reste affiché ici, sous les champs à corriger ; un succès ferme le
 * panneau avec `true`, et {@link BankPanel.open} relit le RIB partagé.
 *
 * ## Une saisie : dialogue, et Enregistrer attend une modification
 *
 * Dialogue centré au bureau, feuille du bas en pile (`dialogSide()`, règle
 * « Saisir » du `CLAUDE.md` de l'app, 2026-09-14). Le nom `*-panel` est d'avant
 * cette règle.
 *
 * « Enregistrer » exige une modification (`bankAccountDraftChanged`) ET un
 * compte complet. Comme l'IBAN ne redescend pas et que la complétude l'exige,
 * corriger une seule ligne d'adresse n'arme rien tant qu'il n'est pas ressaisi
 * (constaté le 2026-09-14) : l'exigence d'IBAN est une décision de sécurité,
 * pas un détail d'écran.
 */
@Component({
  selector: 'app-bank-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BankAccountForm,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './bank-panel.html',
  styleUrl: './bank-panel.scss',
})
export class BankPanel {
  /** `md` (490 px) : les rangées du RIB s'y empilent sous 14rem (échelle `FoldPanelSize`). */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  /**
   * Ouvre le panneau sur le RIB déjà lu, et **relit** au succès : la réponse
   * d'écriture ne porte rien, seule la relecture dit les quatre derniers
   * chiffres — aux deux cartes à la fois, puisqu'elles lisent la même source.
   *
   * Le **mandat** se relit aussi : enregistrer le RIB révoque le brouillon côté
   * serveur (plan `plan-mandat-client.md` §8), dont le papier nommerait un
   * compte qui n'est plus le RIB. Sans relecture, la carte mandat proposerait
   * encore de télécharger un brouillon que l'API refuse désormais.
   *
   * `stack` quand il s'ouvre depuis un panneau (les mentions manquantes du
   * mandat) : le panneau reste dessous, et relit ce qu'il montre.
   */
  static async open(
    panels: FoldPanelHostService,
    accounts: ClientBankAccount,
    mandates: ClientMandate,
    companyId: string,
    stack = false,
  ): Promise<void> {
    const ref = panels.open<BankPanelData, boolean>(BankPanel, {
      side: dialogSide(),
      stack,
      data: { companyId, account: accounts.account() },
    });
    if ((await ref.closed) === true) {
      await Promise.all([accounts.reload(companyId), mandates.refresh(companyId)]);
    }
  }

  readonly data = input.required<BankPanelData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly accounts = inject(ClientBankAccount);
  private readonly mandates = inject(ClientMandate);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** Le RIB en saisie — IBAN vide, le reste repris du compte lu (`bankAccountDraftFrom`). */
  protected readonly draft = signal<BankAccountDraft>(EMPTY_BANK_ACCOUNT_DRAFT);

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const account = this.data().account;
      untracked(() => {
        if (account !== null) {
          this.draft.set(bankAccountDraftFrom(account));
        }
      });
    });
  }

  /**
   * La civilité ou forme juridique est exigée quand l'émetteur frappe en
   * interentreprises. `null` (schéma pas encore lu, ou lecture échouée) ⇒ non
   * requise : le serveur reste le garde, par `holder_legal_form_missing`.
   */
  protected readonly holderLegalFormRequired = computed(
    () => this.mandates.issuerScheme() === 'B2B',
  );

  /** « RIB enregistré · •••• 3041 », ou l'absence — l'en-tête dit ce qu'on remplace. */
  protected readonly saved = computed(() => bankLine(this.data().account, this.t().account));

  /**
   * Quelque chose a changé depuis la lecture, ET le compte se recopie **en
   * entier** (complément excepté), forme juridique présente si le mandat
   * interentreprises l'exige, pays en deux lettres : ce panneau désarme le
   * bouton sur un pays mal formé, là où la fiche staff laisse le serveur refuser.
   */
  protected readonly canSave = computed(() => {
    const draft = this.draft();
    return (
      !this.saving() &&
      bankAccountDraftChanged(draft, this.data().account) &&
      isBankAccountComplete(draft) &&
      holderLegalFormFits(draft) &&
      holderLegalFormProvided(draft, this.holderLegalFormRequired()) &&
      hasCountryCode(draft)
    );
  });

  protected readonly submitLabel = computed(() =>
    bankActionLabel(this.data().account, this.t().account),
  );

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const refusal = await this.accounts.save(
      this.data().companyId,
      toBankAccountPayload(this.draft()),
    );
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
}
