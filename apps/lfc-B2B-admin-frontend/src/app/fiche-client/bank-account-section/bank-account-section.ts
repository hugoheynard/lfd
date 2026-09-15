import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  BankAccountForm,
  bankAccountDraftFrom,
  EMPTY_BANK_ACCOUNT_DRAFT,
  holderLegalFormFits,
  holderLegalFormProvided,
  isBankAccountComplete,
  toBankAccountPayload,
  withoutIban,
  type BankAccountDraft,
} from '@lfd/b2b-ui/payment';
import type { CompanyBankAccountView } from '@lfd/contracts';
import { httpErrorCode } from '@lfd/endpoints';
import { FoldButtonComponent, FoldCalloutComponent, FoldFieldsetComponent } from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { BankAccountService } from '../bank-account/bank-account.service';

/**
 * Le **RIB du client** dans la section « Moyens de paiement ».
 *
 * ## Pourquoi un composant à part, et pas quelques lignes dans la section
 *
 * Le RIB et le mandat peignent la même carte, mais ce sont deux sujets : une
 * coordonnée qu'on recopie, et une autorisation qu'on obtient. Les fondre ferait
 * de `paiement-section` — déjà longue — l'endroit où l'on pose la troisième
 * chose. Le composant charge et écrit lui-même, comme la section le fait pour
 * le mandat : personne d'autre ne lit ce RIB.
 *
 * ## 🔴 L'IBAN ne revient jamais, et le formulaire le dit
 *
 * Le champ IBAN repart **vide** à chaque ouverture, même quand un compte est
 * enregistré : la lecture n'en rend que les quatre derniers caractères. Tout le
 * reste se réaffiche — titulaire, adresse, BIC ne sont pas des secrets, et les
 * relire est exactement ce qu'on veut avant d'imprimer un mandat.
 *
 * ## Le formulaire est partagé
 *
 * Les champs sont `lfd-bank-account-form` de `@lfd/b2b-ui/payment` (depuis le
 * 2026-09-14), le même que le panneau RIB de `/mon-compte` ; leurs règles sont
 * dans `bank-account-draft.model.ts`. Cette section garde ce qui est à elle : le
 * rappel d'impression, le compte enregistré, l'avertissement de compte mandaté,
 * le bouton et l'écriture.
 *
 * ## 🔴 Sous un mandat actif, le RIB ne se remplace pas
 *
 * Le serveur refuse au staff, comme au client, de remplacer le RIB d'une
 * société dont le mandat est actif (`BankAccountBoundToActiveMandateError`,
 * plan `documentation/comptabilite/plan-restes-du-mandat.md` §8) : le papier
 * signé nomme l'ancien compte, et l'amendement sous la même RUM attend la
 * réponse de la banque. Le formulaire se désarme donc, et dit le seul geste de
 * sortie — révoquer, puis frapper un mandat neuf sur le nouveau RIB.
 *
 * Il remplace l'avertissement « ce compte n'est pas celui du mandat en cours »,
 * qui ne s'allumait que sous un mandat actif — c'est-à-dire exactement là où
 * l'écriture est désormais refusée.
 */
/** Le code du refus « un mandat actif désigne ce compte » (409). */
const BOUND_TO_ACTIVE_MANDATE = 'payments.bank_account.bound_to_active_mandate';

@Component({
  selector: 'app-bank-account-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BankAccountForm, FoldCalloutComponent, FoldButtonComponent, FoldFieldsetComponent],
  templateUrl: './bank-account-section.html',
  styleUrl: './bank-account-section.scss',
})
export class BankAccountSection {
  private readonly accounts = inject(BankAccountService);
  private readonly notify = inject(NotifyService);

  /** La société concernée ; `null` tant qu'elle n'existe pas (mode ouverture). */
  readonly companyId = input<string | null>(null);
  /**
   * Un mandat **actif** couvre-t-il ce compte ? Vrai ⇒ le formulaire se désarme.
   * L'écran ne fait qu'anticiper le refus : le serveur reste le garde.
   */
  readonly mandateActive = input(false);
  /**
   * La civilité ou forme juridique du titulaire est-elle exigée ? Vrai quand
   * l'émetteur frappe en interentreprises — la section paiement le lit déjà
   * sur la section mandat (`issuerScheme`). Faux par défaut : inconnu ⇒ non
   * requise, le serveur reste le garde.
   */
  readonly holderLegalFormRequired = input(false);

  /**
   * Le RIB connu, à chaque lecture et après chaque écriture — `null` s'il n'y
   * en a pas.
   *
   * Il sort d'ici parce que la section parente en a besoin pour dire où en est
   * le dossier, et **pas** pour l'afficher : c'est ce composant qui le montre.
   * L'alternative — faire charger le RIB par le parent aussi — coûterait une
   * seconde requête pour la même ligne, et ferait diverger deux états du même
   * fait à la première écriture.
   */
  readonly accountChange = output<CompanyBankAccountView | null>();

  protected readonly account = signal<CompanyBankAccountView | null>(null);
  protected readonly busy = signal(false);

  /** Le RIB en cours de saisie — IBAN toujours vide à l'ouverture. */
  protected readonly draft = signal<BankAccountDraft>(EMPTY_BANK_ACCOUNT_DRAFT);

  constructor() {
    effect(() => {
      const id = this.companyId();
      if (id !== null) {
        void this.load(id);
      }
    });
  }

  /**
   * Le RIB se recopie en entier, complément excepté (`isBankAccountComplete`),
   * et la civilité ou forme juridique tient dans sa case de 40 caractères —
   * présente, quand le mandat interentreprises l'exige.
   */
  protected readonly canSave = computed(() => {
    const draft = this.draft();
    return (
      !this.mandateActive() &&
      isBankAccountComplete(draft) &&
      holderLegalFormFits(draft) &&
      holderLegalFormProvided(draft, this.holderLegalFormRequired())
    );
  });

  /** Y a-t-il un compte enregistré à afficher ? */
  protected readonly hasAccount = computed(() => this.account() !== null);

  protected async save(): Promise<void> {
    const id = this.companyId();
    if (id === null || !this.canSave()) {
      return;
    }

    this.busy.set(true);
    try {
      await this.accounts.save(id, toBankAccountPayload(this.draft()));
      this.notify.success('RIB enregistré.');
      // 🔴 Seul l'IBAN se vide : les autres champs se REPRENNENT de la lecture
      // qui suit. Les effacer donnerait l'impression qu'ils ont été perdus.
      this.draft.update(withoutIban);
      await this.load(id);
    } catch (error) {
      this.notify.error(error, "Le RIB n'a pas été enregistré.");
      // Refusé malgré le formulaire désarmé : le mandat est devenu actif depuis
      // la lecture. Relire remonte le RIB, et la section parente se relit avec
      // lui — le mandat actif désarme alors le formulaire.
      if (httpErrorCode(error) === BOUND_TO_ACTIVE_MANDATE) {
        await this.load(id);
      }
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Charge le RIB. Un échec laisse le bloc **muet** plutôt que bruyant : le RIB
   * est un à-côté de la fiche, et une erreur ne doit pas couvrir l'écran à
   * chaque ouverture — c'est la même règle que le mandat juste à côté.
   */
  private async load(companyId: string): Promise<void> {
    try {
      const { account } = await this.accounts.read(companyId);
      this.account.set(account);
      this.accountChange.emit(account);
      if (account !== null) {
        this.draft.set(bankAccountDraftFrom(account));
      }
    } catch {
      this.account.set(null);
      this.accountChange.emit(null);
    }
  }
}
