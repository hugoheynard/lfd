import { Injectable } from "@nestjs/common";

import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { BinDesk } from "../../channels/delivery/index.js";
import type { ContainerLine, ContainerMark } from "../../domain/entities/order-contents.js";
import type { PackingSheet } from "../../domain/entities/packing-sheet.js";
import {
  citeContainer,
  PackingContainerVoidedEvent,
} from "../../domain/events/packing-container.events.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import { citedOrderOf, releaseToStock } from "./container-support.js";

/**
 * **Annuler des contenants** — le geste du poste (K2b, §5.1), extrait de
 * `VoidPackingContainerHandler` pour servir aussi le retrait d'une feuille
 * (plan A1, `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 2.2). Un seul geste, deux appelants : le poste en annule un, le retrait
 * les annule tous.
 *
 * Pour chaque contenant : le BAC d'abord chez la livraison (`BinDesk.voidBin`,
 * qui refuse un bac chargé ou une tournée partie), puis le contenant. Ensuite
 * ce qu'ils portaient revient à la réserve, en UNE passe triée par SKU — feuille
 * → bac → réserve, l'ordre des verrous de tous les gestes. 🔴 Par
 * `stock.release`, jamais `giveBack` : celui-là est le retour au fournil, il
 * incrémente `returned` et laisserait les pièces comptées « au bac »
 * (`vitruve` B1).
 *
 * Dans l'unité de travail de l'appelant, sur une feuille qu'il a verrouillée ;
 * il ne la sauve pas — l'appelant peut encore la muter (le retrait la marque).
 */
@Injectable()
export class PackingContainerVoiding {
  constructor(
    private readonly stocks: PackingStockRepository,
    private readonly desk: BinDesk,
    private readonly events: DomainEventPublisher,
  ) {}

  /** @returns ce qui est revenu à la réserve, une ligne par article. */
  async voidAll(
    sheet: PackingSheet,
    containerIds: readonly string[],
    mark: ContainerMark,
  ): Promise<readonly ContainerLine[]> {
    const released: ContainerLine[] = [];
    for (const containerId of containerIds) {
      const container = sheet.liveContainer(containerId);
      if (container.bin !== null) {
        await this.desk.voidBin(container.bin.binId);
      }
      released.push(...sheet.voidContainer(containerId, mark));
    }
    const bySku = sumBySku(released);
    await releaseToStock(this.stocks, sheet.serviceDay, bySku);
    for (const containerId of containerIds) {
      await this.events.publishTraced(
        new PackingContainerVoidedEvent(
          citedOrderOf(sheet),
          citeContainer(sheet.containerList, containerId),
        ),
      );
    }
    return bySku;
  }
}

function sumBySku(lines: readonly ContainerLine[]): readonly ContainerLine[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.sku, (totals.get(line.sku) ?? 0) + line.quantity);
  }
  return [...totals.entries()].map(([sku, quantity]) => ({ sku, quantity }));
}
