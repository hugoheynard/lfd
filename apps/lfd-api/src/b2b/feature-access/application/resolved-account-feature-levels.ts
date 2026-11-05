import type { FeatureLevelsView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  AccountFeatureLevelsReader,
  type FeatureLevelsSubject,
} from "../../account/domain/ports/account-feature-levels.reader.js";
import { FeatureLevelResolver } from "./feature-level.resolver.js";

/**
 * Les niveaux d'une personne pour `GET /me`, par la résolution même des
 * gardes : l'écran ne peut pas promettre ce que le serveur refuserait.
 *
 * 🔴 Des niveaux, et rien d'autre : la réponse ne dit jamais « vous êtes
 * exempté » ; un testeur voit une boutique ouverte, pas une liste.
 */
@Injectable()
export class ResolvedAccountFeatureLevels extends AccountFeatureLevelsReader {
  constructor(private readonly resolver: FeatureLevelResolver) {
    super();
  }

  levelsFor(subject: FeatureLevelsSubject): Promise<FeatureLevelsView> {
    return this.resolver.levelsFor(subject);
  }
}
