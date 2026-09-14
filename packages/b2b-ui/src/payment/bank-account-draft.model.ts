import type { CustomerBankAccountView, SetCompanyBankAccountPayload } from '@lfd/contracts';

/**
 * Le **RIB d'une société** tel qu'on le saisit — le brouillon de
 * `lfd-bank-account-form`, sa lecture depuis une vue, sa validation de forme et
 * sa conversion en payload.
 *
 * Pur, sans Angular : le back-office (fiche client) et l'app cliente
 * (`/mon-compte`) écrivent ce RIB chacun par son chemin, avec les MÊMES règles.
 *
 * ## 🔴 L'IBAN ne redescend jamais
 *
 * La lecture n'en rend que `last4` : un brouillon lu depuis une vue part donc
 * d'un IBAN **vide**, et le reste — titulaire, adresse, BIC — se reprend. Rien
 * de cela n'est un secret, et le relire est ce qu'on veut avant de remplacer.
 */

/** Le pays proposé tant que rien n'est enregistré — celui de presque tous nos clients. */
export const DEFAULT_BANK_COUNTRY = 'FR';

/** Les quatre derniers caractères — tout ce qu'on connaît d'un compte enregistré. */
const IBAN_LAST4 = 4;

/** Longueur d'un code pays ISO 3166-1 alpha-2, ce que le contrat exige. */
const COUNTRY_CODE_LENGTH = 2;

export interface BankAccountDraft {
  readonly iban: string;
  readonly bic: string;
  readonly holder: string;
  readonly line1: string;
  readonly line2: string;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
}

export const EMPTY_BANK_ACCOUNT_DRAFT: BankAccountDraft = {
  iban: '',
  bic: '',
  holder: '',
  line1: '',
  line2: '',
  postalCode: '',
  city: '',
  countryCode: DEFAULT_BANK_COUNTRY,
};

/**
 * Ce qu'une lecture rend du compte, côté client comme côté staff : la vue staff
 * porte en plus les zones du mandat, qui ne se saisissent pas ici.
 */
export type BankAccountReadView = Pick<
  CustomerBankAccountView,
  'holder' | 'addressLine1' | 'addressLine2' | 'postalCode' | 'city' | 'countryCode' | 'bic'
>;

/** Préremplit depuis la lecture — **IBAN vide**, pays par défaut si la ligne n'en porte pas. */
export function bankAccountDraftFrom(view: BankAccountReadView): BankAccountDraft {
  return {
    iban: '',
    bic: view.bic,
    holder: view.holder,
    line1: view.addressLine1,
    line2: view.addressLine2,
    postalCode: view.postalCode,
    city: view.city,
    countryCode: view.countryCode === '' ? DEFAULT_BANK_COUNTRY : view.countryCode,
  };
}

/**
 * Le RIB se recopie **en entier** — sauf le complément d'adresse, facultatif sur
 * un vrai RIB. Un compte à moitié rempli ne se découvrirait qu'au rejet du lot,
 * cinq jours après l'envoi.
 */
export function isBankAccountComplete(draft: BankAccountDraft): boolean {
  return (
    draft.iban.trim() !== '' &&
    draft.bic.trim() !== '' &&
    draft.holder.trim() !== '' &&
    draft.line1.trim() !== '' &&
    draft.postalCode.trim() !== '' &&
    draft.city.trim() !== ''
  );
}

/**
 * Le pays tient-il en deux lettres, comme le contrat l'exige ?
 *
 * Séparé de {@link isBankAccountComplete} parce que les deux écrans ne l'ont
 * pas appliqué pareil (vérifié le 2026-09-14) : l'app cliente désarme le bouton
 * sur un pays mal formé, la fiche staff laisse le serveur le refuser. La
 * mutualisation ne change le comportement d'aucun des deux.
 */
export function hasCountryCode(draft: BankAccountDraft): boolean {
  return draft.countryCode.trim().length === COUNTRY_CODE_LENGTH;
}

/** Le payload d'écriture : champs rognés, pays en capitales. */
export function toBankAccountPayload(draft: BankAccountDraft): SetCompanyBankAccountPayload {
  return {
    iban: draft.iban.trim(),
    bic: draft.bic.trim(),
    holder: draft.holder.trim(),
    line1: draft.line1.trim(),
    line2: draft.line2.trim(),
    postalCode: draft.postalCode.trim(),
    city: draft.city.trim(),
    countryCode: draft.countryCode.trim().toUpperCase(),
  };
}

/**
 * Le brouillon diffère-t-il de ce que la lecture a rendu ? C'est ce qui arme
 * « Enregistrer » (règle « Saisir » de l'app cliente, 2026-09-14).
 *
 * Comparé sur la **charge envoyée** (champs rognés, pays en capitales) : un
 * espace ajouté puis retiré n'est pas une modification. Sans compte lu
 * (`null`), la référence est le brouillon vide.
 *
 * 🔴 L'IBAN ne redescend jamais : la vue n'en porte pas, le brouillon lu part
 * vide. Un IBAN saisi compte donc TOUJOURS comme une modification. Ce test ne
 * dit rien de la complétude — et comme {@link isBankAccountComplete} exige
 * l'IBAN, corriger une seule ligne d'adresse n'arme rien tant qu'il n'est pas
 * ressaisi (constaté le 2026-09-14 ; l'exigence reste une décision de sécurité).
 */
export function bankAccountDraftChanged(
  draft: BankAccountDraft,
  view: BankAccountReadView | null,
): boolean {
  const origin = view === null ? EMPTY_BANK_ACCOUNT_DRAFT : bankAccountDraftFrom(view);
  return (
    JSON.stringify(toBankAccountPayload(draft)) !== JSON.stringify(toBankAccountPayload(origin))
  );
}

/**
 * Après un enregistrement, **seul l'IBAN se vide** : effacer le reste donnerait
 * l'impression qu'il a été perdu, et la relecture le reprend de toute façon.
 */
export function withoutIban(draft: BankAccountDraft): BankAccountDraft {
  return { ...draft, iban: '' };
}

/**
 * Enregistrer va-t-il désigner un compte **différent** de celui que le mandat
 * actif nomme ?
 *
 * Comparé sur les quatre derniers caractères, seuls disponibles des deux côtés.
 * C'est grossier — deux comptes peuvent les partager — et c'est suffisant :
 * l'avertissement invite à vérifier, il ne bloque rien. Muet sans mandat actif
 * (`''`) et tant que l'IBAN saisi n'a pas quatre caractères.
 */
export function changesMandatedAccount(draft: BankAccountDraft, mandateLast4: string): boolean {
  if (mandateLast4 === '') {
    return false;
  }
  const typed = draft.iban.replace(/\s/gu, '');
  return typed.length >= IBAN_LAST4 && !typed.endsWith(mandateLast4);
}

/**
 * Les **libellés** de `lfd-bank-account-form`. Le défaut est le texte de la fiche
 * staff, mot pour mot : elle ne passe rien et ne change pas.
 */
export interface BankAccountFormLabels {
  readonly holder: string;
  /**
   * Les exemples de saisie sont FACULTATIFS : le back-office les montre, l'app
   * cliente n'en affiche aucun — et ses dictionnaires refusent une chaîne vide
   * (`client-copy.spec.ts`). Absent = pas d'exemple.
   */
  readonly holderPlaceholder?: string;
  readonly line1: string;
  readonly line1Placeholder?: string;
  readonly line2: string;
  readonly line2Placeholder?: string;
  readonly postalCode: string;
  readonly postalCodePlaceholder?: string;
  readonly city: string;
  readonly cityPlaceholder?: string;
  readonly country: string;
  readonly countryPlaceholder?: string;
  readonly iban: string;
  readonly ibanPlaceholder?: string;
  /** Sous l'IBAN : il ne revient d'aucune route, et on le dit avant qu'on le cherche. */
  readonly ibanHint: string;
  readonly bic: string;
  readonly bicPlaceholder?: string;
}

export const BANK_ACCOUNT_FORM_LABELS_FR: BankAccountFormLabels = {
  holder: 'Titulaire du compte',
  holderPlaceholder: 'Refuge du Col SARL',
  line1: 'Adresse',
  line1Placeholder: '12 rue des Alpages',
  line2: 'Complément',
  line2Placeholder: 'Bâtiment, étage…',
  postalCode: 'Code postal',
  postalCodePlaceholder: '73150',
  city: 'Ville',
  cityPlaceholder: 'Val d’Isère',
  country: 'Pays',
  countryPlaceholder: 'FR',
  iban: 'IBAN',
  ibanPlaceholder: 'FR14 2004 1010 0505 0001 3M02 606',
  ibanHint: 'Saisi une fois. Il ne sera plus jamais réaffiché.',
  bic: 'BIC',
  bicPlaceholder: 'CEPAFRPP751',
};
