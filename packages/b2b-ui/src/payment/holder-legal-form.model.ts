import { holderLegalFormOf, listedHolderLegalForm, toLegalForm } from '@lfd/contracts';

/**
 * La **case « Civilité / forme juridique »** du RIB — une liste fermée, plus un
 * « Autre » court.
 *
 * C'était du texte libre, et la commerciale y tapait « Col Pers SAS » là où le
 * mandat attend « SAS » (constaté le 2026-10-12) : le nom du titulaire
 * s'imprimait deux fois, dont une tronquée dans une case étroite. La règle est
 * « Titulaire = Col Pers, Forme = SAS » ; le serveur la tient à l'écriture
 * (`DebtorAccount.assertWritableLegalForm`), cet écran la rend difficile à
 * enfreindre.
 *
 * La liste est celle de l'écran Identité, civilités en tête
 * (`HOLDER_LEGAL_FORM_LABELS`, `@lfd/contracts`) : une seule source. C'est le
 * LIBELLÉ qui s'enregistre et s'imprime.
 *
 * Pur, sans Angular : le formulaire partagé le lit, et ses tests aussi.
 */

/** L'entrée « Autre » de la liste — une clé d'écran, jamais envoyée au serveur. */
export const HOLDER_LEGAL_FORM_OTHER = '__other__';

/** Ce que la liste peut tenir : une forme, ou « Autre ». */
export type HolderLegalFormSelection = string;

/** Ce que l'écran montre d'une valeur : la ligne choisie, et le texte libre si « Autre ». */
export interface HolderLegalFormState {
  /** `null` tant que rien n'est choisi. */
  readonly selection: HolderLegalFormSelection | null;
  /** La saisie de « Autre » ; `''` pour une forme de la liste. */
  readonly other: string;
}

/**
 * Lit une valeur enregistrée. Une forme de la liste, à la casse près, en
 * reprend la ligne ; tout le reste — y compris « Col Pers SAS » d'avant la
 * règle — s'affiche en « Autre » **avec sa valeur**, sans être effacé : on
 * corrige ce qu'on voit, on ne perd pas ce qu'on n'a pas vu.
 */
export function holderLegalFormStateOf(value: string): HolderLegalFormState {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { selection: null, other: '' };
  }
  const listed = listedHolderLegalForm(trimmed);
  return listed === null
    ? { selection: HOLDER_LEGAL_FORM_OTHER, other: value }
    : { selection: listed, other: '' };
}

/**
 * La valeur à poser quand on choisit une ligne. « Autre » reprend la saisie
 * libre en cours si la valeur n'était pas déjà une forme de la liste — sinon il
 * part vide, pour qu'on tape la forme rare.
 */
export function holderLegalFormFromSelection(
  selection: HolderLegalFormSelection,
  current: string,
): string {
  if (selection !== HOLDER_LEGAL_FORM_OTHER) {
    return selection;
  }
  return holderLegalFormStateOf(current).selection === HOLDER_LEGAL_FORM_OTHER ? current : '';
}

/**
 * Le libellé à proposer d'après la forme de la **société** (`formeJuridique`) —
 * direct, c'est la même liste (micro-entreprise et auto-entrepreneur
 * proposent « Entreprise individuelle », `holderLegalFormOf`). `''` quand elle est inconnue : rien ne
 * s'invente. Une proposition, pas une vérité : le titulaire est celui que la
 * banque connaît, et peut différer de la société.
 */
export function holderLegalFormFromCompany(companyLegalForm: string): string {
  const form = toLegalForm(companyLegalForm);
  return form === null ? '' : holderLegalFormOf(form);
}

/** Le séparateur de l'aperçu imprimé : « SAS · Col Pers ». */
const PREVIEW_SEPARATOR = ' · ';

/**
 * Le bloc titulaire tel que le mandat l'imprime : la forme, puis le nom.
 * `''` quand les deux sont vides.
 */
export function holderLegalFormPreview(holder: string, holderLegalForm: string): string {
  return [holderLegalForm.trim(), holder.trim()]
    .filter((part) => part !== '')
    .join(PREVIEW_SEPARATOR);
}
