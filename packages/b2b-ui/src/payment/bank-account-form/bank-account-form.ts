import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';
import { HOLDER_LEGAL_FORM_LABELS } from '@lfd/contracts';
import { FoldInputComponent, FoldListboxComponent, type FoldSelectOption } from 'fold-ng';

import {
  BANK_ACCOUNT_FORM_LABELS_FR,
  type BankAccountDraft,
  type BankAccountFormLabels,
} from '../bank-account-draft.model';
import {
  HOLDER_LEGAL_FORM_OTHER,
  holderLegalFormFromCompany,
  holderLegalFormFromSelection,
  holderLegalFormPreview,
  holderLegalFormStateOf,
  type HolderLegalFormSelection,
} from '../holder-legal-form.model';

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
 * La civilité ou forme juridique est une **liste fermée** plus un « Autre »
 * court (`holder-legal-form.model.ts`) : saisie libre, elle recevait le nom du
 * titulaire (« Col Pers SAS »). L'aperçu sous les champs montre le bloc tel que
 * le mandat l'imprime.
 *
 * Fragment transparent : ses rangées deviennent enfants directs de l'hôte. La
 * largeur sous laquelle les champs s'empilent se règle par
 * `--lfd-bank-account-field-basis` (18rem par défaut).
 */
@Component({
  selector: 'lfd-bank-account-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldInputComponent, FoldListboxComponent],
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

  /**
   * La forme juridique de la **société** (`formeJuridique`, clé du catalogue
   * `@lfd/contracts`) — de quoi préremplir une case vide. `''` = inconnue : rien
   * ne se propose, rien ne s'invente.
   */
  readonly companyLegalForm = input('');

  protected readonly holderLegalFormOptions = computed<
    readonly FoldSelectOption<HolderLegalFormSelection>[]
  >(() => [
    ...HOLDER_LEGAL_FORM_LABELS.map((choice) => ({ value: choice, label: choice })),
    { value: HOLDER_LEGAL_FORM_OTHER, label: this.labels().holderLegalFormOtherLabel },
  ]);

  /** « Autre » choisi à la main — il reste ouvert même vidé. */
  private readonly otherChosen = signal(false);
  /** La case a été touchée : le préremplissage ne la réécrit plus. */
  private readonly legalFormTouched = signal(false);

  protected readonly holderLegalFormState = computed(() =>
    holderLegalFormStateOf(this.value().holderLegalForm),
  );

  protected readonly holderLegalFormSelection = computed<HolderLegalFormSelection | null>(() =>
    this.otherChosen() ? HOLDER_LEGAL_FORM_OTHER : this.holderLegalFormState().selection,
  );

  protected readonly otherOpen = computed(
    () => this.holderLegalFormSelection() === HOLDER_LEGAL_FORM_OTHER,
  );

  /** « SAS · Col Pers » — le bloc titulaire tel qu'il s'imprime. */
  protected readonly preview = computed(() =>
    holderLegalFormPreview(this.value().holder, this.value().holderLegalForm),
  );

  constructor() {
    // Une case VIDE reçoit la forme de la société, tant qu'on n'y a pas touché :
    // le brouillon lu après coup (RIB enregistré) passe toujours devant.
    effect(() => {
      const suggested = holderLegalFormFromCompany(this.companyLegalForm());
      const empty = this.value().holderLegalForm.trim() === '';
      if (suggested !== '' && empty && !this.legalFormTouched()) {
        untracked(() => this.set('holderLegalForm', suggested));
      }
    });
  }

  protected chooseLegalForm(selection: HolderLegalFormSelection): void {
    this.legalFormTouched.set(true);
    this.otherChosen.set(selection === HOLDER_LEGAL_FORM_OTHER);
    this.set(
      'holderLegalForm',
      holderLegalFormFromSelection(selection, this.value().holderLegalForm),
    );
  }

  protected typeOtherLegalForm(value: string): void {
    this.legalFormTouched.set(true);
    this.set('holderLegalForm', value);
  }

  protected set<K extends keyof BankAccountDraft>(key: K, value: BankAccountDraft[K]): void {
    this.value.update((draft) => ({ ...draft, [key]: value }));
  }
}
