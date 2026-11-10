import type { SaleUnit } from "./resupply-sale-unit.js";

/** La clé d'un compte : l'article ET son unité — deux unités ne se somment jamais. */
export function stockKeyOf(sku: string, saleUnit: SaleUnit): string {
  return `${saleUnit}:${sku}`;
}

/** Ce que tout compte par article porte : son article, son unité, son libellé. */
export interface TallyIdentity {
  readonly sku: string;
  readonly saleUnit: SaleUnit;
  readonly label: string;
}

/**
 * **Les comptes par (article, unité)** — la mécanique commune au cumul du
 * fournil (`resupplyTotals`), au reste du jour (`estimateStock`) et à
 * l'onglet Stock (`DayStock`), qui la recopiaient chacun (audit du
 * réassort, 2026-11-02). Ce qui s'y ajoute diffère ; la règle, non : un
 * compte par (article, unité), jamais pièces et grammes ensemble (L2b-1),
 * l'ordre et le libellé de la première apparition.
 */
export class StockTallies<T extends TallyIdentity> {
  private readonly byKey = new Map<string, T>();

  constructor(private readonly blank: (identity: TallyIdentity) => T) {}

  /** Le compte de l'article dans son unité, ouvert à la première apparition. */
  of(identity: TallyIdentity): T {
    const key = stockKeyOf(identity.sku, identity.saleUnit);
    const known = this.byKey.get(key);
    if (known !== undefined) {
      return known;
    }
    const { sku, saleUnit, label } = identity;
    const opened = this.blank({ sku, saleUnit, label });
    this.byKey.set(key, opened);
    return opened;
  }

  /** Les comptes, dans l'ordre de leur première apparition. */
  values(): readonly T[] {
    return [...this.byKey.values()];
  }
}
