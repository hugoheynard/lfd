import type { LocalizedText } from "@lfd/pim-contracts";

import type { IncoCategory } from "../value-objects/inco-category.js";

/** Une entrée telle qu'on la LIT — sans comportement, donc sans agrégat. */
export interface AllergenEntryView {
  readonly id: string;
  readonly code: string;
  /** Libellé granulaire — « Noisettes ». L'aplatissement en une langue est au lecteur. */
  readonly name: LocalizedText;
  /** Semée et verrouillée. L'écran l'affiche en lecture seule, cadenas et raison. */
  readonly official: boolean;
  /** Retirée du référentiel à cette date — elle ne se propose plus à la saisie. */
  readonly archivedAt: Date | null;
}

/**
 * Une catégorie et ce qu'elle accueille, d'un bloc.
 *
 * Imbriqué plutôt que deux listes à recoudre : le mapping est n:1 et c'est tout
 * l'objet du modèle — sept céréales sous `gluten`, huit fruits à coque sous
 * `tree_nuts`. Un lecteur qui devrait les rapprocher lui-même referait ce
 * rapprochement dans chaque écran.
 */
export interface AllergenCategoryView {
  readonly id: string;
  readonly key: string;
  /** La **mention d'étiquette** quand la catégorie est de l'annexe II. */
  readonly name: LocalizedText;
  /**
   * `null` = hors annexe II, donc hors projection INCO — qu'il s'agisse d'une
   * catégorie maison ou de « hors obligation UE ». C'est de cette colonne que
   * le catalogue `eu` se dérive (D2), jamais d'un champ `scope` stocké.
   */
  readonly incoCategory: IncoCategory | null;
  readonly official: boolean;
  readonly position: number;
  readonly entries: readonly AllergenEntryView[];
}

/**
 * Port de **lecture** du référentiel d'allergènes.
 *
 * Distinct des dépôts d'écriture (ISP) : ce qu'on lit ici est une projection —
 * catégories et entrées cousues, ordonnées, sans invariant à tenir — et une
 * vue n'a pas de comportement. Les faire cohabiter dans un `AllergenRepository`
 * unique obligerait l'écran de consultation à dépendre de `save()`, et la
 * commande d'édition à dépendre d'une forme d'affichage.
 */
export abstract class AllergenCatalogueReader {
  /**
   * Le référentiel entier, catégories ordonnées, entrées comprises.
   *
   * Le filtre `eu` / `world` ne s'applique pas ici : il se **dérive** de
   * `incoCategory` (D2), et le faire côté port dupliquerait la règle dans
   * chaque adaptateur.
   */
  abstract catalogue(): Promise<readonly AllergenCategoryView[]>;

  /**
   * Les codes que le référentiel connaît — ce que `NutritionDeclaration`
   * recevra pour valider une fiche sans aller chercher quoi que ce soit (D3).
   *
   * **Les entrées archivées en sont**, et c'est le point délicat : une
   * déclaration enregistrée hier cite un code que le staff peut archiver
   * demain, et la relire ne doit pas la déclarer invalide — on invaliderait
   * l'étiquette d'un produit déjà servi sans que personne ne l'ait décidé.
   * L'archivage retire une entrée de ce qu'on PROPOSE, pas de ce qu'on
   * reconnaît ; c'est `catalogue()` et son `archivedAt` qui servent le
   * sélecteur.
   */
  abstract knownCodes(): Promise<ReadonlySet<string>>;
}
