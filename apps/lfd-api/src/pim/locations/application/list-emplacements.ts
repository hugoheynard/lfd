import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { EmplacementSnapshot } from "../domain/entities/emplacement.js";
import { EmplacementRepository } from "../domain/ports/emplacement.repository.js";
import { EmplacementUsageReader } from "../domain/ports/emplacement-usage.reader.js";

/** Un emplacement tel que la liste le rend : son état, plus ce que l'écran doit savoir. */
export type EmplacementListItem = EmplacementSnapshot & {
  /** Combien de familles le cochent. Zéro ⇒ supprimable. */
  readonly usedByCategories: number;
};

/** Lecture des emplacements — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListEmplacementsQuery {}

@QueryHandler(ListEmplacementsQuery)
export class ListEmplacementsHandler implements IQueryHandler<
  ListEmplacementsQuery,
  EmplacementListItem[]
> {
  constructor(
    private readonly emplacements: EmplacementRepository,
    private readonly usage: EmplacementUsageReader,
  ) {}

  /**
   * La lecture rend des **instantanés**, pas des agrégats : un lecteur n'a
   * aucune raison de pouvoir muter ce qu'il affiche.
   *
   * Le compte d'usages voyage avec. Il ne vit PAS dans l'agrégat — un
   * emplacement ignore les familles qui le cochent — mais l'écran en a besoin
   * pour DIRE qu'une suppression échouera, au lieu de l'apprendre après le
   * clic. Même raison que le compte de fiches sur une famille.
   *
   * Une seule lecture des grilles pour toute la liste, jamais une par ligne.
   */
  async execute(): Promise<EmplacementListItem[]> {
    const [emplacements, counts] = await Promise.all([
      this.emplacements.listAll(),
      this.usage.countByEmplacement(),
    ]);
    return emplacements.map((emplacement) => {
      const snapshot = emplacement.snapshot();
      return { ...snapshot, usedByCategories: counts.get(snapshot.id) ?? 0 };
    });
  }
}
