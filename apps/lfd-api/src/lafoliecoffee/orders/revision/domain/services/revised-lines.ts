import { MAX_LINE_WEIGHT_GRAMS } from "@lfd/contracts";

import {
  SaleUnitMismatchError,
  WeightAboveGuardError,
} from "../../../domain/errors/sale-quantity-errors.js";
import { ensureMinimumQuantity } from "../../../domain/services/sale-quantity-rules.js";
import { mergeRequestedOptions } from "../../../domain/services/line-option-choices.js";
import type { RequestedOptionChoice } from "../../../domain/value-objects/order-line-options.js";
import { carriedOptionChoices } from "./carried-option-choices.js";
import type {
  OrderLineInput,
  OrderLineSnapshot,
} from "../../../domain/value-objects/order-line.js";

/** Une ligne demandée : un SKU, sa quantité et son unité, comme la passation les reçoit. */
export interface RequestedLine {
  readonly sku: string;
  readonly quantity: number;
  /** Absent = `piece` (le contrat de la passation). */
  readonly saleUnit?: "piece" | "weight" | undefined;
  /**
   * Les options demandées. **Absent = garder celles de la ligne**, réduites
   * à la nouvelle quantité ({@link carriedOptionChoices}) ; présent, même
   * vide, elles remplacent.
   */
  readonly optionChoices?: RequestedOptionChoice[] | undefined;
}

/**
 * Les lignes d'une révision, triées entre ce qui garde son prix et ce qui
 * passe par la résolution du jour.
 */
export interface RevisedLineRequests {
  /** L'ordre des SKU tel que la demande les cite, doublons fusionnés. */
  readonly order: readonly string[];
  /** Les lignes déjà présentes, à leur prix figé et à leur nouvelle quantité. */
  readonly frozen: ReadonlyMap<string, OrderLineInput>;
  /** Les lignes nouvelles, à tarifer au jour de la modification. */
  readonly fresh: readonly RequestedLine[];
  /**
   * Les options REDEMANDÉES d'une ligne gardée, par SKU — à juger contre le
   * catalogue avant de remplacer celles de `frozen`, qui portent d'ici là les
   * options d'avant réduites à la nouvelle quantité.
   */
  readonly keptOptions: ReadonlyMap<string, readonly RequestedOptionChoice[]>;
}

/**
 * **R3 de la modification** (`documentation/commandes/modification/modifier-une-commande.md`, § 2.3 « Les règles ») :
 * une ligne dont le SKU était dans la révision PRÉCÉDENTE garde son prix
 * unitaire, son taux de TVA et la trace qui les explique, quelle que soit la
 * quantité ; une ligne nouvelle est tarifée au jour, par le chemin de la
 * passation. Un SKU retiré puis remis dans une révision ultérieure n'est plus
 * dans la précédente : il repart au prix du jour.
 *
 * Les quantités d'un même SKU s'additionnent, comme `OrderLinePricing` le fait
 * à la passation : une commande ne porte qu'une ligne par SKU.
 *
 * **L'unité est figée avec le prix** (`vente-au-poids.md`, P3) : une ligne
 * gardée se redemande dans l'unité de la précédente, et au poids sous la garde
 * d'une tonne. Son pas et son minimum ne se relisent pas — le catalogue n'est
 * pas relu pour une ligne gardée (R3) ; une ligne nouvelle, elle, se valide
 * contre l'article à la tarification. Seule dérogation : le minimum en pièces
 * d'une ligne gardée dont la quantité CHANGE ({@link ensureKeptMinimums}).
 *
 * @throws {SaleUnitMismatchError} la ligne redemandée change d'unité.
 * @throws {WeightAboveGuardError} une ligne gardée au poids dépasse une tonne.
 */
export function revisedLineRequests(
  previous: readonly OrderLineSnapshot[],
  requested: readonly RequestedLine[],
): RevisedLineRequests {
  const before = new Map(previous.map((line) => [line.sku, line]));
  const quantities = new Map<string, number>();
  const units = new Map<string, "piece" | "weight">();
  const optioned = new Set<string>();
  for (const line of requested) {
    const unit = line.saleUnit ?? "piece";
    const kept = before.get(line.sku);
    if (kept !== undefined && kept.saleUnit !== unit) {
      throw new SaleUnitMismatchError(line.sku, kept.saleUnit);
    }
    quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);
    units.set(line.sku, unit);
    if (line.optionChoices !== undefined) {
      optioned.add(line.sku);
    }
  }
  const options = mergeRequestedOptions(
    requested.map((line) => ({ ...line, saleUnit: line.saleUnit ?? "piece" })),
  );
  const frozen = new Map<string, OrderLineInput>();
  const fresh: RequestedLine[] = [];
  const keptOptions = new Map<string, readonly RequestedOptionChoice[]>();
  for (const [sku, quantity] of quantities) {
    const kept = before.get(sku);
    if (kept === undefined) {
      const optionChoices = options.get(sku);
      fresh.push({
        sku,
        quantity,
        saleUnit: units.get(sku),
        optionChoices: optionChoices === undefined ? undefined : [...optionChoices],
      });
    } else {
      frozen.set(sku, frozenLineOf(kept, quantity));
      if (optioned.has(sku)) {
        keptOptions.set(sku, options.get(sku) ?? []);
      }
    }
  }
  return { order: [...quantities.keys()], frozen, fresh, keptOptions };
}

/**
 * La ligne d'avant, à sa nouvelle quantité. Le rangement et l'éligibilité à la
 * remise de retrait sont recalculés ensuite comme à la passation (R4) : ils
 * n'appartiennent pas au prix.
 */
function frozenLineOf(line: OrderLineSnapshot, quantity: number): OrderLineInput {
  if (line.saleUnit === "weight" && quantity > MAX_LINE_WEIGHT_GRAMS) {
    throw new WeightAboveGuardError(line.sku, quantity, MAX_LINE_WEIGHT_GRAMS);
  }
  return {
    sku: line.sku,
    productName: line.productName,
    unitPriceMillicents: line.unitPriceMillicents,
    vatRate: line.vatRate,
    quantity,
    saleUnit: line.saleUnit,
    pricing: line.pricing,
    allergens: line.allergens,
    // Les options d'avant, réduites à la nouvelle quantité : le « sans »
    // d'abord, puis les options. Remplacées ensuite si la demande en redit.
    optionChoices: carriedOptionChoices(line, quantity),
  };
}

/** Une ligne gardée dont la révision change la quantité — la seule que le minimum relit. */
export interface KeptQuantityChange {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: "piece" | "weight";
  readonly quantity: number;
}

/**
 * Les lignes gardées dont la quantité diffère de la révision précédente. Une
 * ligne inchangée n'y figure pas : une commande passée avant qu'un minimum soit
 * posé doit rester révisable sur ses AUTRES lignes.
 */
export function keptQuantityChanges(
  previous: readonly OrderLineSnapshot[],
  split: RevisedLineRequests,
): readonly KeptQuantityChange[] {
  return previous.flatMap((line) => {
    const kept = split.frozen.get(line.sku);
    if (kept === undefined || kept.quantity === line.quantity) {
      return [];
    }
    const change: KeptQuantityChange = {
      sku: line.sku,
      productName: line.productName,
      saleUnit: line.saleUnit,
      quantity: kept.quantity,
    };
    return [change];
  });
}

/**
 * **Dérogation à R3, décidée par Hugo le 2026-10-29**
 * (`documentation/catalogue/plan-quantite-minimale.md`, M4) : une ligne gardée
 * qu'on CHANGE de quantité ne descend pas sous le minimum que le catalogue
 * publie aujourd'hui pour la clientèle de la commande. Son prix, lui, reste
 * figé — seul le minimum est relu.
 *
 * `minimums` : le minimum de chaque SKU encore au catalogue. Un SKU absent est
 * un article sorti du catalogue depuis la commande : aucun minimum connu, la
 * ligne passe (décidé le 2026-10-29 — refuser au nom d'une règle qu'on ne peut
 * plus lire bloquerait la commande sans geste de sortie). Un article au poids
 * n'a pas de minimum en pièces ({@link ensureMinimumQuantity}).
 *
 * @throws {QuantityBelowMinimumError} une ligne gardée baissée sous le minimum.
 */
export function ensureKeptMinimums(
  changes: readonly KeptQuantityChange[],
  minimums: ReadonlyMap<string, number | null>,
): void {
  for (const change of changes) {
    const minQuantity = minimums.get(change.sku);
    if (minQuantity === undefined) {
      continue;
    }
    ensureMinimumQuantity(
      { sku: change.sku, name: change.productName, saleUnit: change.saleUnit, minQuantity },
      change.quantity,
    );
  }
}
