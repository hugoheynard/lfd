import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { TvaRegimeView } from "@lfd/pim-contracts";

import { TvaRegimeRepository } from "../domain/ports/tva-regime.repository.js";

/** Lecture des régimes de TVA — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListTvaRegimesQuery {}

/** Un régime jamais visé : absent de la carte d'usages, donc à zéro. */
const UNUSED = { emporter: 0, surPlace: 0 } as const;

/**
 * Rend un **modèle de lecture**, et non l'instantané de l'agrégat : la vue porte
 * en plus le nombre de familles qui visent chaque régime. C'est ce qui manquait
 * à l'écran pour prévenir avant une suppression que la base refusera.
 */
@QueryHandler(ListTvaRegimesQuery)
export class ListTvaRegimesHandler implements IQueryHandler<ListTvaRegimesQuery, TvaRegimeView[]> {
  constructor(private readonly regimes: TvaRegimeRepository) {}

  async execute(): Promise<TvaRegimeView[]> {
    const [regimes, usage] = await Promise.all([
      this.regimes.listAll(),
      this.regimes.usageByRegime(),
    ]);
    return regimes.map((regime) => {
      const snapshot = regime.snapshot();
      return { ...snapshot, usage: usage.get(snapshot.id) ?? UNUSED };
    });
  }
}
