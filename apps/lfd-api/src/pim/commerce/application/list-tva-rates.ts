import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { TvaRateView } from "@lfd/pim-contracts";

import { TvaRateRepository } from "../domain/ports/tva-rate.repository.js";

/** Lecture des taux de TVA — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListTvaRatesQuery {}

/** Un taux jamais visé : absent de la carte d'usages, donc à zéro. */
const UNUSED = { emporter: 0, surPlace: 0 } as const;

/**
 * Rend un **modèle de lecture**, et non l'instantané de l'agrégat : la vue porte
 * en plus le nombre de familles qui visent chaque taux. C'est ce qui manquait
 * à l'écran pour prévenir avant une suppression que la base refusera.
 */
@QueryHandler(ListTvaRatesQuery)
export class ListTvaRatesHandler implements IQueryHandler<ListTvaRatesQuery, TvaRateView[]> {
  constructor(private readonly regimes: TvaRateRepository) {}

  async execute(): Promise<TvaRateView[]> {
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
