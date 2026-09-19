import { PointOfSaleReader } from "../../../../points-of-sale/domain/ports/point-of-sale.reader.js";
import type { PointOfSale } from "../../../../points-of-sale/domain/value-objects/point-of-sale.js";
import { VatRate } from "../../../../vat-rates/domain/entities/vat-rate.js";
import {
  VatRateRepository,
  type VatRateUsage,
} from "../../../../vat-rates/domain/ports/vat-rate.repository.js";

/**
 * Les doubles de ce que les faits du catalogue NOMMENT (plan des phrases du
 * journal, lot B) : les points de vente d'une matrice, les taux d'un
 * changement de TVA. Partagés par les suites des familles et des fiches, qui
 * nomment les mêmes objets.
 */

/**
 * Des points de vente connus par leur nom. L'offre n'est pas le sujet — le
 * catalogue la lit par son propre port (`PointOfSaleOfferReader`).
 */
export class KnownPointsOfSale extends PointOfSaleReader {
  constructor(private readonly labels: Readonly<Record<string, string>>) {
    super();
  }

  listAll(): Promise<readonly PointOfSale[]> {
    return Promise.resolve(
      Object.entries(this.labels).map(([id, label]) => ({
        id,
        kind: "shop" as const,
        label,
        baseUrl: null,
        contexts: [],
      })),
    );
  }

  ensureRootPointOfSale(): Promise<void> {
    return Promise.resolve();
  }
}

/** Des taux connus, en lecture : ce que nommer un changement de TVA demande. */
export class KnownVatRates extends VatRateRepository {
  private readonly rates: readonly VatRate[];

  constructor(
    rates: Readonly<Record<string, { readonly name: string; readonly percent: number }>>,
  ) {
    super();
    this.rates = Object.entries(rates).map(([id, { name, percent }]) =>
      VatRate.open({ id, name, description: "", percent }),
    );
  }

  listAll(): Promise<VatRate[]> {
    return Promise.resolve([...this.rates]);
  }
  findById(id: string): Promise<VatRate | null> {
    return Promise.resolve(this.rates.find((rate) => rate.id === id) ?? null);
  }
  findByPercent(percent: number): Promise<VatRate | null> {
    return Promise.resolve(this.rates.find((rate) => rate.percent === percent) ?? null);
  }
  usageByRegime(): Promise<ReadonlyMap<string, VatRateUsage>> {
    return Promise.resolve(new Map());
  }
  add(): Promise<void> {
    return Promise.resolve();
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}
