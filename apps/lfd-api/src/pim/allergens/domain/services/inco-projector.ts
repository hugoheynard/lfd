import { readLocalized, type Locale } from "@lfd/pim-contracts";

import type { AllergenCategoryView } from "../ports/allergen-catalogue.reader.js";
import type { IncoCategory } from "../value-objects/inco-category.js";

/** Une mention d'étiquette : la catégorie de l'annexe II et son libellé. */
export interface IncoLabel {
  readonly category: IncoCategory;
  readonly label: string;
}

/** Ce qu'une déclaration donne à lire — **et ce qu'elle tait**. */
export interface IncoProjection {
  readonly labels: readonly IncoLabel[];
  /**
   * Vrai dès qu'un code déclaré n'apparaît pas dans {@link labels}.
   *
   * Deux causes, et les taire toutes les deux serait la même faute : le code est
   * inconnu du référentiel, **ou** il est connu sans obligation UE (sarrasin,
   * maïs, noix de coco). Une liste amputée qui se tait se lit « aucun
   * allergène » — l'affirmation positive à la place du silence.
   */
  readonly incomplete: boolean;
}

/**
 * **La projection INCO, à partir du référentiel en base.**
 *
 * Construit une fois par lecture du référentiel, puis appliqué autant de fois
 * qu'il y a de déclarations : c'est ce qui laisse les projections de canal
 * **pures et synchrones** — elles reçoivent le référentiel, elles ne vont pas le
 * chercher (D6, même forme que D3).
 *
 * Trois opérations, celles de l'adaptateur INCO :
 *
 * - **filtre** — seules les catégories de l'annexe II s'impriment. Une catégorie
 *   maison est déclarable et n'apparaîtra jamais comme mention réglementaire
 *   (D1) ; la catégorie « hors obligation UE » non plus ;
 * - **dédup n:1** — sept céréales ne font qu'une mention « gluten », huit fruits
 *   à coque qu'une mention « fruits à coque ». C'est la raison d'être du modèle ;
 * - **localise** — le libellé est celui de la CATÉGORIE, pas de l'entrée : c'est
 *   la mention d'étiquette qui fait foi, pas le nom granulaire.
 *
 * Les entrées **archivées sont projetées** comme les autres. L'archivage retire
 * une entrée de ce qu'on propose, jamais de ce qu'on reconnaît (D2 bis) — et une
 * étiquette déjà imprimée ne se vide pas parce que le staff a rangé son écran.
 */
export class IncoProjector {
  private constructor(
    /** Code → catégorie de l'annexe II. Un code hors annexe II n'y figure pas. */
    private readonly byCode: ReadonlyMap<string, IncoLabel>,
  ) {}

  /**
   * @param categories le référentiel entier, tel que `AllergenCatalogueReader`
   *   le rend.
   * @param locale la langue des mentions. Le français fait foi ; les canaux
   *   monolingues passent `SOURCE_LOCALE`.
   */
  static from(categories: readonly AllergenCategoryView[], locale: Locale): IncoProjector {
    const byCode = new Map<string, IncoLabel>();
    for (const category of categories) {
      const inco = category.incoCategory;
      if (inco === null) {
        continue;
      }
      const label: IncoLabel = { category: inco, label: readLocalized(category.name, locale) };
      for (const entry of category.entries) {
        byCode.set(entry.code, label);
      }
    }
    return new IncoProjector(byCode);
  }

  /** Projette des codes déclarés vers leurs mentions, en disant ce qu'il manque. */
  project(codes: readonly string[]): IncoProjection {
    const byCategory = new Map<IncoCategory, IncoLabel>();
    let dropped = 0;
    for (const code of codes) {
      const label = this.byCode.get(code);
      if (label === undefined) {
        dropped += 1;
        continue;
      }
      byCategory.set(label.category, label);
    }
    return { labels: [...byCategory.values()], incomplete: dropped > 0 };
  }
}
