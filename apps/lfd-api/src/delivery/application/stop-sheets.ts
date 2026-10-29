import type { DeliveryPackingLineView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  DeliveryDeparturesReader,
  DeliveryColdSkusReader,
  type DeliveryShortfall,
} from "../channels/commerce/index.js";
import { BinCatalogReader } from "../domain/ports/bin-catalog.reader.js";
import { expectedBinCount } from "../domain/services/expected-bins.js";
import { proposePacking } from "../domain/services/propose-packing.js";
import { packingTypeOf } from "./delivery-packing-view.js";
import { packingLinesOf } from "./packing-lines.js";

/** La fiche d'un arrêt : ses produits, et les bacs que la proposition prévoit. */
export interface StopSheet {
  /** Ce qui PART — réduit par un départ incomplet décidé (2026-10-25). */
  readonly lines: readonly DeliveryPackingLineView[];
  /** Le départ incomplet décidé, ou `null` sans décision. */
  readonly shortfall: DeliveryShortfall | null;
  /** `null` : la proposition ne sait pas le dire, ou la commande n'a aucune ligne. */
  readonly binsExpected: number | null;
}

/**
 * **La fiche de chaque arrêt de « Ma tournée »** (`parcours-du-livreur.md`,
 * PL4 — « une seule fiche ») : le contenu de la feuille d'atelier, lu par le
 * port du COMMERCE (`DeliveryDeparturesReader` : ce qui PART, réduit par un
 * départ incomplet décidé — 2026-10-25), jamais par le fournil. La
 * livraison ne parle au fournil que par `production/channels/delivery/`
 * (depuis le 2026-10-04, `CLAUDE.md` § 3), qui ne porte que deux faits — la
 * clôture et le retirage d'une journée —, et le contenu d'une commande
 * appartient au commerce (vérifié le 2026-10-07). Le froid vient du catalogue
 * relayé par le commerce, et le nombre de bacs attendus de la MÊME proposition
 * que le poste de colisage (`proposePacking`, types en service).
 *
 * Une lecture ; aucune ligne ne porte de montant (le port n'en a pas).
 */
@Injectable()
export class StopSheets {
  constructor(
    private readonly departures: DeliveryDeparturesReader,
    private readonly cold: DeliveryColdSkusReader,
    private readonly catalog: BinCatalogReader,
  ) {}

  async of(orderIds: readonly string[]): Promise<ReadonlyMap<string, StopSheet>> {
    const unique = [...new Set(orderIds)];
    if (unique.length === 0) {
      return new Map();
    }
    const [coldSkus, types, capacities, perOrder] = await Promise.all([
      this.cold.coldSkus(),
      this.catalog.listTypes(),
      this.catalog.activeCapacities(),
      Promise.all(unique.map((orderId) => this.departures.departureOf(orderId))),
    ]);
    const inService = types.filter((type) => type.archivedAt === null).map(packingTypeOf);
    return new Map(
      unique.map((orderId, index): [string, StopSheet] => {
        const departure = perOrder[index];
        const lines = packingLinesOf(departure?.lines ?? [], coldSkus);
        const binsExpected =
          lines.length === 0
            ? null
            : expectedBinCount(proposePacking(lines, inService, capacities));
        return [orderId, { lines, shortfall: departure?.shortfall ?? null, binsExpected }];
      }),
    );
  }
}
