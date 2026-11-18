/**
 * **Combien de familles et de fiches portent un taux** — ce que l'archive lit
 * pour refuser un taux qui sert.
 *
 * Un port à part du dépôt (ISP) : l'archive n'a besoin que de ce compte, et la
 * liste en lit un autre, ventilé par contexte (`VatRateRepository.usageByRegime`).
 * La règle — « un taux qui sert ne s'archive pas » — est dans `VatRate.archive`.
 */
export abstract class VatRateUsageReader {
  /** Familles et fiches qui le portent, tous contextes confondus. */
  abstract holdersOf(rateId: string): Promise<number>;
}
