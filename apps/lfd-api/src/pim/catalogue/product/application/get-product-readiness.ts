import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { ProductReadinessView } from "@lfd/pim-contracts";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { ReadinessRepository } from "../domain/ports/readiness.repository.js";

export class GetProductReadinessQuery {
  constructor(readonly id: string) {}
}

/**
 * La seule déclaration, relue.
 *
 * Elle existe pour que la route qui déclare puisse RENDRE ce qu'elle vient
 * d'inscrire sans qu'une commande se mette à retourner un modèle de lecture :
 * la commande mute, la requête lit, et l'écran repeint sa vignette sans
 * recharger la fiche entière — donc sans écraser ce que l'utilisateur est en
 * train de saisir.
 */
@QueryHandler(GetProductReadinessQuery)
export class GetProductReadinessHandler implements IQueryHandler<
  GetProductReadinessQuery,
  ProductReadinessView | null
> {
  constructor(
    private readonly readiness: ReadinessRepository,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {}

  async execute(query: GetProductReadinessQuery): Promise<ProductReadinessView | null> {
    const found = await this.readiness.read(query.id);
    if (found === null) {
      return null;
    }
    const authors = await this.staffAuthors.identify([found.readyBy]);
    return {
      readyAt: found.readyAt.toISOString(),
      readyBy: found.readyBy,
      readyByName: authors.nameOf(found.readyBy),
    };
  }
}
