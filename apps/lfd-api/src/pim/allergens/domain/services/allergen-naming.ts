import { LOCALES, SOURCE_LOCALE, type Locale } from "@lfd/pim-contracts";

import type { AllergenCategoryView } from "../ports/allergen-catalogue.reader.js";
import { IncoProjector } from "./inco-projector.js";

/**
 * **La projection INCO dans chaque langue du référentiel** — construite une
 * fois par lecture du référentiel, comme {@link IncoProjector}, pour que les
 * projections de canal restent pures.
 *
 * Ajoutée pour la boutique (`documentation/pim/plan-allergenes-en-boutique.md`,
 * décision (b) de Hugo, 2026-10-27) : le client lit ses allergènes dans sa
 * langue, et c'est le référentiel qui les nomme — la vitrine ne recopie aucun
 * dictionnaire. Une langue que le référentiel n'a pas traduite retombe sur le
 * français (`readLocalized`), jamais sur un libellé vide.
 */
export class AllergenNaming {
  private constructor(private readonly byLocale: Readonly<Record<Locale, IncoProjector>>) {}

  static from(categories: readonly AllergenCategoryView[]): AllergenNaming {
    // Une clé par langue, écrite : `Record<Locale, …>` refuse de compiler le
    // jour où `LOCALES` gagne une langue que cette carte ne nommerait pas.
    return new AllergenNaming({
      fr: IncoProjector.from(categories, "fr"),
      en: IncoProjector.from(categories, "en"),
      it: IncoProjector.from(categories, "it"),
    });
  }

  /** Les langues nommées, la source d'abord. */
  get locales(): readonly Locale[] {
    return LOCALES;
  }

  /** La projection dans la langue source : celle des mentions `allergenLabels` du fil. */
  get source(): IncoProjector {
    return this.byLocale[SOURCE_LOCALE];
  }

  in(locale: Locale): IncoProjector {
    return this.byLocale[locale];
  }
}
