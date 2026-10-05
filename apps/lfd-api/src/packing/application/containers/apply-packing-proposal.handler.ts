import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { BinDesk } from "../../channels/delivery/index.js";
import type { PackingSheet, SheetMark } from "../../domain/entities/packing-sheet.js";
import type { PackingStock } from "../../domain/entities/packing-stock.js";
import { EmptyProposalError } from "../../domain/errors/packing-container-errors.js";
import {
  citeContainer,
  PackingContainerMovedEvent,
  PackingContainerOpenedEvent,
} from "../../domain/events/packing-container.events.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import {
  distributeProposal,
  type ProposalEntry,
  type ProposedBin,
} from "../../domain/services/proposal-distribution.js";
import { ApplyPackingProposalCommand } from "./apply-packing-proposal.command.js";
import { citedOrderOf, lockedSheet } from "./container-support.js";

/**
 * **« Proposer », appliqué par le serveur d'un seul coup** (suite de K2b,
 * `colisage/colisage.md` §7).
 *
 * UNE unité de travail : la commande sous verrou, puis chaque bac proposé
 * déclaré par la livraison (`BinDesk`, qui rejoint la transaction), puis la
 * réserve de chaque article verrouillée dans l'ordre des SKU, puis le contenu
 * réparti bac par bac (`distributeProposal`). Le verrou suit l'ordre des
 * autres gestes : commande, livraison, réserve. Un refus, n'importe où, et rien
 * n'est écrit — ni bac chez la livraison, ni contenant, ni pièce.
 *
 * Ne place que ce qui est sorti du four ; le reste reste « à répartir », dans
 * des bacs déjà là. Le partage d'une moitié voisine (`shareCandidate`) n'est
 * PAS appliqué : c'est un dernier recours, qui se fait à la main.
 *
 * @throws {PackingOrderNotDrawnYetError} @throws {PackedOrderSealedError}
 * @throws {ContainersCountedError} @throws {ProposalOverContainersError}
 * @throws {EmptyProposalError} @throws {ContainerCeilingReachedError}
 *   et les refus de la livraison (commande hors livraison, tournée partie…).
 */
@CommandHandler(ApplyPackingProposalCommand)
export class ApplyPackingProposalHandler implements ICommandHandler<
  ApplyPackingProposalCommand,
  void
> {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly stocks: PackingStockRepository,
    private readonly desk: BinDesk,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ApplyPackingProposalCommand): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      sheet.assertCanApplyProposal();
      const entries = await this.entriesOf(sheet);
      const mark = { at: this.clock.now(), by: command.staffUserId };
      // Les bacs d'abord : leur nombre ne dépend pas de la réserve.
      const empty = distributeProposal(entries, () => null, new Map());
      const containerIds = await this.openBins(sheet, empty, mark);
      const stocks = await this.lockStocks(command.serviceDay, entries);
      const units = await this.unitsOf();
      const bins = distributeProposal(entries, units, availableOf(sheet, stocks));
      await this.fillBins(sheet, bins, containerIds, stocks, mark);
      for (const stock of stocks.values()) {
        await this.stocks.save(stock);
      }
      await this.sheets.save(sheet);
    });
  }

  /** Les entrées de la proposition. @throws {EmptyProposalError} aucune. */
  private async entriesOf(sheet: PackingSheet): Promise<readonly ProposalEntry[]> {
    const proposal = await this.desk.propose(sheet.orderId);
    if (proposal.bins.length === 0) {
      throw new EmptyProposalError(sheet.reference);
    }
    return proposal.bins;
  }

  /** Déclare chaque bac chez la livraison et ouvre son contenant ; rend leurs ids, dans l'ordre. */
  private async openBins(
    sheet: PackingSheet,
    bins: readonly ProposedBin[],
    mark: SheetMark,
  ): Promise<readonly string[]> {
    const ids: string[] = [];
    for (const proposed of bins) {
      sheet.assertCanOpenContainer();
      const declared = await this.desk.declareBin({
        orderId: sheet.orderId,
        binTypeId: proposed.binTypeId,
        half: proposed.half,
        innerBags: 0,
      });
      const id = this.ids.next();
      const bin = { binId: declared.binId, code: declared.code, half: declared.half };
      sheet.openContainer({ id, nature: "bin", bin, opened: mark, voided: null, lines: [] });
      await this.events.publishTraced(
        new PackingContainerOpenedEvent(
          citedOrderOf(sheet),
          citeContainer(sheet.containerList, id),
          "bin",
        ),
      );
      ids.push(id);
    }
    return ids;
  }

  /** La réserve de chaque article proposé, verrouillée dans l'ordre des SKU. */
  private async lockStocks(
    serviceDay: string,
    entries: readonly ProposalEntry[],
  ): Promise<ReadonlyMap<string, PackingStock>> {
    const skus = [...new Set(entries.flatMap((entry) => entry.content.map((item) => item.sku)))];
    const locked = new Map<string, PackingStock>();
    for (const sku of skus.sort((a, b) => a.localeCompare(b))) {
      locked.set(sku, await this.stocks.lock(serviceDay, sku));
    }
    return locked;
  }

  private async unitsOf(): Promise<(binTypeId: string, sku: string) => number | null> {
    const cells = await this.desk.capacities();
    const grid = new Map(cells.map((cell) => [`${cell.binTypeId}|${cell.sku}`, cell.units]));
    return (binTypeId, sku) => grid.get(`${binTypeId}|${sku}`) ?? null;
  }

  /** Répartit le contenu de chaque bac : la commande borne, la réserve donne. */
  private async fillBins(
    sheet: PackingSheet,
    bins: readonly ProposedBin[],
    containerIds: readonly string[],
    stocks: ReadonlyMap<string, PackingStock>,
    mark: SheetMark,
  ): Promise<void> {
    for (const [index, proposed] of bins.entries()) {
      const containerId = containerIds[index] ?? "";
      for (const { sku, quantity } of proposed.lines) {
        const line = sheet.lineToTouch(sku);
        const pieces = sheet.allocate(containerId, sku, quantity, mark);
        stocks.get(sku)?.take(pieces, line.productName);
        await this.events.publishTraced(
          new PackingContainerMovedEvent(
            "filled",
            citedOrderOf(sheet),
            citeContainer(sheet.containerList, containerId),
            line,
            pieces,
          ),
        );
      }
    }
  }
}

/** Par SKU : ce qui reste de la ligne, borné par ce que la réserve a de libre. */
function availableOf(
  sheet: PackingSheet,
  stocks: ReadonlyMap<string, PackingStock>,
): ReadonlyMap<string, number> {
  return new Map(
    sheet.lines.map((line) => [line.sku, Math.min(line.quantity, stocks.get(line.sku)?.free ?? 0)]),
  );
}
