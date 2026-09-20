import { LOCALES } from '@lfd/pim-contracts';
import type {
  AllergenCategoryAdminView,
  AllergenEntryAdminView,
  LocalizedText,
} from '@lfd/pim-contracts';

/**
 * Les phrases qui expliquent un **cadenas**, et la façon de nommer une origine.
 *
 * Elles vivent ici parce que la page et les deux panneaux disent la même chose
 * au même staff : un bouton absent sans mot se lit comme une panne, et trois
 * copies de la raison finiraient par en donner trois versions. Ce sont des
 * libellés — donc du français — pour des humains francophones.
 */

/** Pourquoi une catégorie de l'annexe II ne se renomme ni ne s'archive. */
export const OFFICIAL_CATEGORY_REASON =
  "Catégorie officielle : son libellé est la mention qui s'imprime sur l'étiquette, au titre de " +
  "l'annexe II du règlement UE 1169/2011. On n'invente pas du droit, on l'enregistre — le libellé " +
  "et le rattachement sont inaltérables, ici comme en base. Seul le rang d'affichage se règle.";

/** Pourquoi une entrée GS1 ne se révise ni ne s'archive. */
export const OFFICIAL_ENTRY_REASON =
  'Code GS1 officiel (AllergenTypeCode T4078), semé et verrouillé. Son libellé et sa catégorie ' +
  'sont du droit : les corriger se fait à la source, contre GS1, par un semis — pas par un ' +
  'formulaire. Archiver un code officiel reviendrait à le supprimer, et la suppression est interdite.';

/** Ce que « hors obligation UE » veut dire, et surtout ce qu'il ne veut pas dire. */
export const NON_EU_REASON =
  "Ces codes GS1 sont officiels, mais aucune catégorie de l'annexe II ne les accueille : ils ne " +
  "s'impriment jamais comme mention réglementaire européenne. « Hors obligation UE » ne veut pas " +
  "dire sans risque — le sarrasin est à déclaration obligatoire au Japon et en Corée. C'est le " +
  "périmètre européen qui est en cause, pas l'innocuité.";

/** Ce qu'archiver fait, et ce qu'il ne fait pas. */
export const ARCHIVE_MEANING =
  "Archiver retire de ce qu'on PROPOSE, jamais de ce qu'on reconnaît. Les fiches qui citent déjà " +
  "cet allergène restent valides et relisibles ; il cesse simplement d'être offert à la saisie. " +
  "Rien n'est supprimé, et cet écran est le seul d'où l'on restaure.";

/** D'où vient une catégorie, en trois mots — la ligne sous son titre. */
export function categoryOrigin(category: AllergenCategoryAdminView): string {
  if (!category.official) {
    return 'Catégorie maison';
  }
  return category.incoCategory === null
    ? 'Officielle, hors obligation UE'
    : 'Annexe II — mention légale';
}

/** Le nombre d'allergènes encore proposés sous une catégorie. */
export function offeredCount(category: AllergenCategoryAdminView): number {
  return category.entries.filter((entry: AllergenEntryAdminView) => entry.archivedAt === null)
    .length;
}

/**
 * Deux textes traduisibles disent-ils la même chose ?
 *
 * Un panneau qui enverrait le libellé à chaque enregistrement ferait consigner
 * un « renommé » au journal pour une ouverture-fermeture sans frappe. Le fait
 * serait faux, et c'est un journal qu'on relit pour comprendre une étiquette.
 */
export function sameLocalizedText(left: LocalizedText, right: LocalizedText): boolean {
  return LOCALES.every((locale) => (left[locale] ?? '') === (right[locale] ?? ''));
}
