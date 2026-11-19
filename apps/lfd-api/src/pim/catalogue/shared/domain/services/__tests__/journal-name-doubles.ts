import { VatRate } from "../../../../../reference/vat-rates/domain/entities/vat-rate.js";
import { VatRateRepository } from "../../../../../reference/vat-rates/domain/ports/vat-rate.repository.js";
import {
  VatRateNamesReader,
  type VatRateName,
} from "../../../../../reference/vat-rates/domain/ports/vat-rate-names.reader.js";

/**
 * Les doubles de ce que les faits du catalogue NOMMENT : les taux d'un
 * changement de TVA. Partagés par les suites
 * des familles et des fiches, qui nomment les mêmes objets.
 */

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
  add(): Promise<void> {
    return Promise.resolve();
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  saveArchival(): Promise<void> {
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Les noms des taux qu'un dépôt doublé connaît — lus par `listAll`, pour ne
 * rien ajouter au relevé d'un dépôt qui journalise ses `findById`.
 */
export class VatRateNamesOf extends VatRateNamesReader {
  constructor(private readonly rates: VatRateRepository) {
    super();
  }

  async namesOf(ids: readonly string[]): Promise<readonly VatRateName[]> {
    const wanted = new Set(ids);
    return (await this.rates.listAll())
      .filter((rate) => wanted.has(rate.id))
      .map((rate) => ({ id: rate.id, name: rate.snapshot().name }));
  }
}
