import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { VatRateView } from "@lfd/pim-contracts";

import { PimContents } from "../../../changes/application/pim-contents.js";
import { listContent, PIM_CONTENT_KEYS } from "../../../changes/application/pim-content-keys.js";
import { VatRateContextUsageReader } from "../domain/ports/vat-rate-context-usage.reader.js";
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
 * en plus le nombre de familles qui visent chaque taux, pour prévenir avant une
 * archive que l'agrégat refusera. Les taux archivés y sont, marqués : c'est
 * d'ici qu'on les restaure, et ce sont les listes de choix qui les écartent.
 */
@QueryHandler(ListVatRatesQuery)
export class ListVatRatesHandler implements IQueryHandler<ListVatRatesQuery, VatRateView[]> {
  constructor(
    private readonly rates: VatRateRepository,
    private readonly usage: VatRateContextUsageReader,
    private readonly contents: PimContents,
  ) {}

  /** Servie sous le numéro `pim` : l'usage se compte sur des tables qu'il couvre. */
  execute(): Promise<VatRateView[]> {
    return this.contents.contentOf(
      PIM_CONTENT_KEYS.vatRates,
      () => this.fromBase(),
      listContent<VatRateView>(),
    );
  }

  private async fromBase(): Promise<VatRateView[]> {
    const [rates, usage] = await Promise.all([this.rates.listAll(), this.usage.usageByRegime()]);
    return rates.map((rate) => {
      const { archivedAt, ...snapshot } = rate.snapshot();
      return {
        ...snapshot,
        usage: usage.get(snapshot.id) ?? UNUSED,
        archived: archivedAt !== null,
      };
    });
  }
}
