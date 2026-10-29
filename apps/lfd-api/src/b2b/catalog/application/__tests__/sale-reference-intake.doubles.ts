import {
  SaleSkuAliasResolutionLog,
  type SaleReferenceEntry,
} from "../../domain/ports/sale-sku-alias-resolution.log.js";
import { SaleSkuAliasTableReader } from "../../domain/ports/sale-sku-alias-table.reader.js";
import { TableSaleSkuAliasReader } from "../../domain/__tests__/sale-sku-alias.doubles.js";
import type { SaleSkuAliasPair } from "../../domain/sale-sku-aliases.js";
import { SaleReferenceIntake } from "../sale-reference-intake.service.js";

/** Les résolutions comptées, dans l'ordre. */
export class RecordingAliasResolutions extends SaleSkuAliasResolutionLog {
  readonly recorded: {
    readonly entry: SaleReferenceEntry;
    readonly resolved: readonly SaleSkuAliasPair[];
  }[] = [];

  record(entry: SaleReferenceEntry, resolved: readonly SaleSkuAliasPair[]): void {
    this.recorded.push({ entry, resolved });
  }
}

/** La table publiée à la boutique, donnée par le test. */
export class GivenSaleSkuAliasTable extends SaleSkuAliasTableReader {
  constructor(private readonly pairs: readonly SaleSkuAliasPair[] = []) {
    super();
  }

  all(): Promise<readonly SaleSkuAliasPair[]> {
    return Promise.resolve(this.pairs);
  }
}

/**
 * **La porte d'entrée sur une table de test** — vide par défaut : chaque
 * référence se lit comme elle-même, le comportement d'avant la bascule.
 */
export function intakeOver(
  pairs: readonly SaleSkuAliasPair[] = [],
  resolutions: RecordingAliasResolutions = new RecordingAliasResolutions(),
): SaleReferenceIntake {
  return new SaleReferenceIntake(new TableSaleSkuAliasReader(pairs), resolutions);
}
