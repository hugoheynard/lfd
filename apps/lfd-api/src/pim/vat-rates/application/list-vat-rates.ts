import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { VatRateView } from "@lfd/pim-contracts";

import { VatRateRepository } from "../domain/ports/vat-rate.repository.js";

/** Lecture des taux de TVA — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListVatRatesQuery {}

/**
 * Un taux jamais visé : absent de la carte d'usages, donc **aucune clé**.
 *
 * Le défaut nommait les canaux, et n'en nommait que deux : un taux que seule la
 * plateforme B2B utilisait s'affichait « 0 famille », ce qui invite à le
 * supprimer — la base l'aurait refusé, mais l'écran promettait l'inverse. Une
 * carte vide ne peut pas oublier un contexte.
 */
const UNUSED: Readonly<Record<string, number>> = {};

/**
 * Rend un **modèle de lecture**, et non l'instantané de l'agrégat : la vue porte
 * en plus le nombre de familles qui visent chaque taux. C'est ce qui manquait
 * à l'écran pour prévenir avant une suppression que la base refusera.
 */
@QueryHandler(ListVatRatesQuery)
export class ListVatRatesHandler implements IQueryHandler<ListVatRatesQuery, VatRateView[]> {
  constructor(private readonly rates: VatRateRepository) {}

  async execute(): Promise<VatRateView[]> {
    const [rates, usage] = await Promise.all([this.rates.listAll(), this.rates.usageByRegime()]);
    return rates.map((rate) => {
      const snapshot = rate.snapshot();
      return { ...snapshot, usage: usage.get(snapshot.id) ?? UNUSED };
    });
  }
}
