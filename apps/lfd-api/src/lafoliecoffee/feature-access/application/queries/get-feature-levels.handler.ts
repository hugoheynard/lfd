import type { FeatureLevelsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { FeatureLevelResolver } from "../feature-level.resolver.js";
import { GetFeatureLevelsQuery } from "./get-feature-levels.query.js";

/**
 * Sert `GET /feature-access`. Le sujet est `null` : une route publique n'a pas
 * de `Principal`, donc pas d'exemption — et la réponse ne peut rien dire d'une
 * adresse.
 *
 * Les niveaux d'une personne connectée, eux, voyagent dans `GET /me`
 * (`AccountFeatureLevelsReader`, 2026-11-05) : `GET /feature-access/mine` a
 * été retirée ce jour-là.
 */
@QueryHandler(GetFeatureLevelsQuery)
export class GetFeatureLevelsHandler implements IQueryHandler<
  GetFeatureLevelsQuery,
  FeatureLevelsView
> {
  constructor(private readonly resolver: FeatureLevelResolver) {}

  execute(): Promise<FeatureLevelsView> {
    return this.resolver.levelsFor(null);
  }
}
