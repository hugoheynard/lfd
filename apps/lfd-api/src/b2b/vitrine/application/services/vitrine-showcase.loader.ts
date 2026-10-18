import type { ShopCatalogueView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { VitrineShowcaseIncompleteError } from "../../domain/errors/vitrine-errors.js";

import { VitrineShowcaseSource } from "../../domain/ports/vitrine-showcase.source.js";
import {
  VITRINE_LANGUAGES,
  type VitrineLanguage,
  type VitrineShowcase,
} from "../../domain/services/vitrine-fingerprints.js";

/**
 * Lit la vue publique et les textes effectifs dans les trois langues — six
 * lectures, UNE fois par balayage, quel que soit le nombre d'abonnés (S3).
 *
 * Trois lectures du catalogue plutôt qu'une composition à trois langues du
 * même calcul (choix laissé au lot W par le §6.2 du plan) : la vue reste
 * exactement celle de `GET /shop/catalogue?lang=`, sans second chemin de
 * prix ; le coût ne se paie que s'il existe un abonné livrable.
 */
@Injectable()
export class VitrineShowcaseLoader {
  constructor(private readonly source: VitrineShowcaseSource) {}

  async load(): Promise<VitrineShowcase> {
    const [fr, en, it] = await Promise.all(
      VITRINE_LANGUAGES.map((language) => this.readIn(language)),
    );
    if (fr === undefined || en === undefined || it === undefined) {
      throw new VitrineShowcaseIncompleteError();
    }
    return {
      catalogues: { fr: fr.catalogue, en: en.catalogue, it: it.catalogue },
      texts: { fr: fr.texts, en: en.texts, it: it.texts },
    };
  }

  private async readIn(language: VitrineLanguage): Promise<{
    readonly catalogue: ShopCatalogueView;
    readonly texts: Readonly<Record<string, string>>;
  }> {
    return {
      catalogue: await this.source.catalogue(language),
      texts: await this.source.texts(language),
    };
  }
}
