import { LOCALES, type LocalizedText } from '@lfd/pim-contracts';

import { LOCALE_NAMES } from '../../../../shared/lang-switch/locale-names';

/**
 * Ce qu'une fiche doit porter pour être publiable — le modèle, séparé de son
 * rendu.
 *
 * Il vit dans son propre fichier parce qu'il répond à une question de MÉTIER
 * (« qu'est-ce qui manque ? ») que rien n'oblige à poser à un composant, et
 * qu'un test peut alors l'interroger sans monter un `TestBed`. Le rail, lui, ne
 * fait plus que peindre.
 */

/** Une condition élémentaire — l'unité que la barre compte. */
export interface CompletenessLeaf {
  readonly label: string;
  readonly done: boolean;
}

/**
 * Une exigence de la fiche, et le détail qu'elle replie.
 *
 * `children` vide ne veut pas dire « rien à vérifier » : l'exigence est alors sa
 * propre feuille (cf. {@link leavesOf}). Une exigence qui a des enfants n'a plus
 * de condition propre — elle vaut ce que valent ses enfants, tous.
 */
export interface CompletenessCheck {
  readonly key: string;
  readonly label: string;
  readonly children: readonly CompletenessLeaf[];
  readonly done: boolean;
}

/**
 * Ce que la complétude a besoin de savoir de la fiche — et rien d'autre.
 *
 * Des faits, pas le store : la règle se teste alors sur un objet littéral, et
 * elle ne bouge pas le jour où le formulaire réorganise ses signaux.
 */
export interface CompletenessFacts {
  readonly name: LocalizedText | null;
  readonly categoryId: string;
  readonly priceSet: boolean;
  readonly allergensDeclared: boolean;
  readonly description: LocalizedText | null;
  readonly mediaCount: number;
}

/**
 * Un texte traduisible, éclaté en une condition **par langue du catalogue**.
 *
 * Toutes les langues, dès la fiche vide. C'est un renversement : les traductions
 * étaient facultatives et n'apparaissaient qu'une fois la source écrite, si bien
 * que le dénominateur de la barre GRANDISSAIT à mesure qu'on tapait — on passait
 * de 5/5 à 5/9 en remplissant un champ, et une fiche « complète » pouvait partir
 * en une seule langue. Publiable veut dire traduit ; le compte doit donc être
 * connu d'avance, et faux tant qu'il manque une langue.
 */
function localized(text: LocalizedText | null): readonly CompletenessLeaf[] {
  return LOCALES.map((locale) => ({
    label: LOCALE_NAMES[locale],
    done: (text?.[locale] ?? '').trim() !== '',
  }));
}

/** Une exigence qui se vérifie d'un coup d'œil : elle n'a rien à déplier. */
function leaf(key: string, label: string, done: boolean): CompletenessCheck {
  return { key, label, children: [], done };
}

/** Une exigence satisfaite quand TOUS ses détails le sont — jamais « à peu près ». */
function branch(
  key: string,
  label: string,
  children: readonly CompletenessLeaf[],
): CompletenessCheck {
  return { key, label, children, done: children.every((child) => child.done) };
}

/**
 * Les exigences, dans l'ordre des sections de la fiche : Identité, Tarif,
 * Allergènes, Communication, Visuels. La liste se lit comme on descend la page.
 *
 * « Nom » et « Famille » étaient une ligne unique — « Nom et famille » — parce
 * que le formulaire les valide ensemble (`isValid()`). Elles se séparent ici :
 * le nom se décline en langues, la famille non, et les garder mêlées obligeait
 * à ranger « Famille » parmi des lignes de traduction.
 *
 * La complétude reste **partielle** : elle ne liste que ce que le modèle sait.
 * L'alternative textuelle des visuels est traduisible et n'y figure pas — elle
 * n'a jamais été exigée, et l'exiger ici la rendrait bloquante par un effet de
 * bord du rail plutôt que par une décision.
 */
export function completenessOf(facts: CompletenessFacts): readonly CompletenessCheck[] {
  return [
    branch('nom', 'Nom', localized(facts.name)),
    leaf('famille', 'Famille', facts.categoryId !== ''),
    leaf('prix', 'Prix', facts.priceSet),
    leaf('allergenes', 'Allergènes déclarés', facts.allergensDeclared),
    branch('description', 'Description', localized(facts.description)),
    leaf('visuel', 'Au moins un visuel', facts.mediaCount > 0),
  ];
}

/** Ce que l'exigence compte : ses détails, ou elle-même faute de détails. */
export function leavesOf(check: CompletenessCheck): readonly CompletenessLeaf[] {
  return check.children.length === 0 ? [{ label: check.label, done: check.done }] : check.children;
}

/**
 * La mesure : des FEUILLES, jamais des exigences.
 *
 * Compter les exigences ferait d'une fiche à laquelle il manque deux langues sur
 * six langues la même chose qu'une fiche à laquelle il manque un prix — une
 * ligne rouge, un point de moins. La barre mesure le travail restant, et il n'y
 * a pas le même travail derrière les deux.
 */
export function measure(checks: readonly CompletenessCheck[]): {
  readonly done: number;
  readonly total: number;
} {
  const leaves = checks.flatMap((check) => leavesOf(check));
  return { done: leaves.filter((entry) => entry.done).length, total: leaves.length };
}
