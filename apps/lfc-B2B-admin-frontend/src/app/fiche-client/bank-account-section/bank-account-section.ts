import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { CompanyBankAccountView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent, FoldInputComponent } from 'fold-ng';

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
 * ## Ce que l'écran NE promet pas
 *
 * Il n'annonce pas ce qu'un changement de compte fait au mandat en cours.
 * Nouveau mandat, ou amendement sous la même RUM : la question est chez la
 * banque et sans réponse. L'avertissement se limite donc à ce qui est **certain**
 * — un mandat ne vaut que pour le compte qu'il nomme.
 */
@Component({
  selector: 'app-bank-account-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldInputComponent, FoldButtonComponent],
  templateUrl: './bank-account-section.html',
  styleUrl: './bank-account-section.scss',
})
export class BankAccountSection {
  private readonly accounts = inject(BankAccountService);
  private readonly notify = inject(NotifyService);

  /** La société concernée ; `null` tant qu'elle n'existe pas (mode ouverture). */
  readonly companyId = input<string | null>(null);
  /** Les 4 chiffres du compte que le mandat ACTIF nomme, `''` s'il n'y en a pas. */
  readonly mandateLast4 = input('');

  protected readonly account = signal<CompanyBankAccountView | null>(null);
  protected readonly busy = signal(false);

  protected readonly ibanDraft = signal('');
  protected readonly bicDraft = signal('');
  protected readonly holderDraft = signal('');
  protected readonly line1Draft = signal('');
  protected readonly line2Draft = signal('');
  protected readonly postalCodeDraft = signal('');
  protected readonly cityDraft = signal('');
  protected readonly countryDraft = signal('FR');

  constructor() {
    effect(() => {
      const id = this.companyId();
      if (id !== null) {
        void this.load(id);
      }
    });
  }

  /**
   * Le RIB se recopie **en entier**, donc le bouton attend tout — sauf le
   * complément d'adresse, facultatif sur un vrai RIB. Un compte à moitié rempli
   * ne se découvrirait qu'au rejet du lot, cinq jours après l'envoi.
   */
  protected readonly canSave = computed(
    () =>
      this.ibanDraft().trim() !== '' &&
      this.bicDraft().trim() !== '' &&
      this.holderDraft().trim() !== '' &&
      this.line1Draft().trim() !== '' &&
      this.postalCodeDraft().trim() !== '' &&
      this.cityDraft().trim() !== '',
  );

  /**
   * Enregistrer va-t-il désigner un compte **différent** de celui que le mandat
   * actif nomme ?
   *
   * Comparé sur les quatre derniers caractères, seuls disponibles des deux
   * côtés. C'est grossier — deux comptes peuvent les partager — et c'est
   * suffisant : l'avertissement invite à vérifier, il ne bloque rien.
   */
  protected readonly changesMandatedAccount = computed(() => {
    const last4 = this.mandateLast4();
    if (last4 === '') {
      return false;
    }
    const typed = this.ibanDraft().replace(/\s/gu, '');
    return typed.length >= IBAN_LAST4 && !typed.endsWith(last4);
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
      this.notify.success('RIB enregistré.');
      // 🔴 Seul l'IBAN se vide : les autres champs se REPRENNENT de la lecture
      // qui suit. Les effacer donnerait l'impression qu'ils ont été perdus.
      this.ibanDraft.set('');
      await this.load(id);
    } catch (error) {
      this.notify.error(error, "Le RIB n'a pas été enregistré.");
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
      if (account !== null) {
        this.fillDrafts(account);
      }
    } catch {
      this.account.set(null);
    }
  }

  /** Préremplit la recopie avec ce que le serveur vient de rendre. */
  private fillDrafts(account: CompanyBankAccountView): void {
    this.bicDraft.set(account.bic);
    this.holderDraft.set(account.holder);
    this.line1Draft.set(account.addressLine1);
    this.line2Draft.set(account.addressLine2);
    this.postalCodeDraft.set(account.postalCode);
    this.cityDraft.set(account.city);
    this.countryDraft.set(account.countryCode === '' ? 'FR' : account.countryCode);
  }
}

/** Les quatre derniers caractères — tout ce qu'on connaît d'un compte enregistré. */
const IBAN_LAST4 = 4;
