import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { FoldInputComponent } from 'fold-ng';

import {
  BANK_ACCOUNT_FORM_LABELS_FR,
  type BankAccountDraft,
  type BankAccountFormLabels,
} from '../bank-account-draft.model';

/**
 * Le **formulaire du RIB** d'une société — titulaire, adresse, IBAN, BIC.
 * Rien d'autre : ni bouton, ni écriture, ni lecture.
 *
 * La fiche staff et le panneau RIB de `/mon-compte` l'habillent chacun (le
 * rappel d'impression sur le mandat, le compte enregistré, l'avertissement de
 * compte mandaté vivent chez eux) et écrivent par leur chemin. La logique est
 * dans `bank-account-draft.model.ts`.
 *
 * 🔴 L'IBAN y entre toujours vide en correction : c'est le brouillon qui le dit
 * (`bankAccountDraftFrom`), pas ce composant.
 *
 * ⚠️ L'adresse n'est pas `lfd-address-form` : son pays est un nom choisi dans une
 * liste, celui d'un RIB un code ISO de deux lettres — le contrat l'exige.
 *
 * Fragment transparent : ses rangées deviennent enfants directs de l'hôte. La
 * largeur sous laquelle les champs s'empilent se règle par
 * `--lfd-bank-account-field-basis` (18rem par défaut).
 */
@Component({
  selector: 'lfd-bank-account-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldInputComponent],
  templateUrl: './bank-account-form.html',
  styleUrl: './bank-account-form.scss',
})
export class BankAccountForm {
  /** Le brouillon du RIB (two-way). */
  readonly value = model.required<BankAccountDraft>();

  /** Les mots du formulaire ; le défaut est le texte de la fiche staff. */
  readonly labels = input<BankAccountFormLabels>(BANK_ACCOUNT_FORM_LABELS_FR);

  /**
   * La civilité ou forme juridique du titulaire est-elle exigée ? Vrai quand
   * l'émetteur frappe en interentreprises (`B2B`) — seul l'écran le sait.
   * Faux par défaut : schéma inconnu ⇒ facultative, le serveur reste le garde.
   * Le champ perd alors sa mention « facultatif », comme les autres champs
   * obligatoires ; désarmer « Enregistrer » est le travail de l'écran
   * (`holderLegalFormProvided`).
   */
  readonly holderLegalFormRequired = input(false);

  protected set<K extends keyof BankAccountDraft>(key: K, value: BankAccountDraft[K]): void {
    this.value.update((draft) => ({ ...draft, [key]: value }));
  }
}
