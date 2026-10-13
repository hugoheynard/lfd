import {
  type DeliveryOrderLine,
  TransferOrderContentsReader,
  type TransferOrderRef,
  TransferOrdersReader,
  type TransferSiteFacts,
  TransferSitesReader,
} from "../../channels/commerce/index.js";
import {
  InternalTransfer,
  type InternalTransferState,
  subjectOf,
  type TransferItem,
} from "../../domain/entities/internal-transfer.js";
import { InternalTransferStaleError } from "../../domain/errors/internal-transfer-errors.js";
import { InternalTransferRepository } from "../../domain/ports/internal-transfer.repository.js";
import {
  CarriedOrderTransfers,
  type CarriedOrderTransferRow,
} from "../../domain/ports/carried-order-transfers.reader.js";
import { TransferBinCounts } from "../../domain/ports/transfer-bin-counts.reader.js";
import {
  InternalTransfersReader,
  TransferredOrdersReader,
  type UnplacedTransferRow,
} from "../../domain/ports/internal-transfers.reader.js";
import { RecordingPublisher } from "../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { TransferAttachment } from "../transfer-attachment.js";
import { TransferPlacer } from "../transfer-placer.js";

/**
 * Les transferts « en base », par leur état — la version est vérifiée comme
 * l'adaptateur le fait. `placed` dit quels transferts ont un arrêt vivant.
 */
export class InMemoryInternalTransfers extends InternalTransferRepository {
  private readonly byId = new Map<string, InternalTransferState>();
  readonly saves: string[] = [];

  constructor(...transfers: readonly InternalTransfer[]) {
    super();
    for (const transfer of transfers) {
      this.byId.set(transfer.id, transfer.toSnapshot());
    }
  }

  load(id: string): Promise<InternalTransfer | null> {
    const state = this.byId.get(id);
    return Promise.resolve(state === undefined ? null : InternalTransfer.restore(state));
  }

  plannedOf(serviceDay: string, siteId: string): Promise<readonly InternalTransfer[]> {
    return Promise.resolve(
      this.all().filter(
        (t) => t.serviceDay === serviceDay && t.siteId === siteId && t.status === "planned",
      ),
    );
  }

  holderOf(item: TransferItem): Promise<string | null> {
    const found = this.all().find((t) =>
      t.heldItems.some((held) => held.kind === item.kind && subjectOf(held) === subjectOf(item)),
    );
    return Promise.resolve(found?.id ?? null);
  }

  save(transfer: InternalTransfer): Promise<void> {
    const stored = this.byId.get(transfer.id);
    if ((stored?.version ?? null) !== transfer.loadedVersion) {
      return Promise.reject(new InternalTransferStaleError(transfer.siteLabel));
    }
    this.byId.set(transfer.id, transfer.toSnapshot());
    this.saves.push(transfer.id);
    return Promise.resolve();
  }

  all(): readonly InternalTransfer[] {
    return [...this.byId.values()].map((state) => InternalTransfer.restore(state));
  }
}

/** La lecture du transfert, par-dessus la même mémoire. */
export class InternalTransfersReaderOver extends InternalTransfersReader {
  constructor(
    private readonly transfers: InMemoryInternalTransfers,
    private readonly placed: ReadonlySet<string> = new Set(),
  ) {
    super();
  }

  unplacedOn(serviceDay: string): Promise<readonly UnplacedTransferRow[]> {
    return Promise.resolve(
      this.transfers
        .all()
        .filter(
          (t) =>
            t.serviceDay === serviceDay &&
            t.departedAt === null &&
            t.orderIds.length > 0 &&
            !this.placed.has(t.id),
        )
        .map((t) => ({ id: t.id, siteId: t.siteId })),
    );
  }

  byId(id: string): Promise<InternalTransfer | null> {
    return this.transfers.load(id);
  }
}

/** Les commandes portées par un transfert, données d'avance. */
export class FixedTransferredOrders extends TransferredOrdersReader {
  constructor(private readonly carried: readonly string[] = []) {
    super();
  }

  transferredAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(orderIds.filter((id) => this.carried.includes(id))));
  }
}

/** Les retraits des sites servis par transfert, tels que le commerce les rendrait. */
export class FixedTransferOrders extends TransferOrdersReader {
  constructor(private readonly refs: readonly TransferOrderRef[] = []) {
    super();
  }

  transferOrdersAmong(orderIds: readonly string[]): Promise<readonly TransferOrderRef[]> {
    return Promise.resolve(this.refs.filter((ref) => orderIds.includes(ref.orderId)));
  }
}

/** Le contenu des commandes, par commande ; une commande absente est inconnue. */
export class FixedTransferContents extends TransferOrderContentsReader {
  readonly asked: (readonly string[])[] = [];

  constructor(
    private readonly lines: ReadonlyMap<string, readonly DeliveryOrderLine[]> = new Map(),
  ) {
    super();
  }

  contentsOf(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly DeliveryOrderLine[]>> {
    this.asked.push(orderIds);
    return Promise.resolve(
      new Map(
        orderIds.flatMap((id) => {
          const found = this.lines.get(id);
          return found === undefined ? [] : [[id, found] as const];
        }),
      ),
    );
  }
}

/** Les sites servis par transfert, donnés d'avance. */
export class FixedTransferSites extends TransferSitesReader {
  constructor(private readonly sites: readonly TransferSiteFacts[] = []) {
    super();
  }

  sitesFor(
    _day: string,
    siteIds: readonly string[],
  ): Promise<ReadonlyMap<string, TransferSiteFacts>> {
    return Promise.resolve(
      new Map(this.sites.filter((s) => siteIds.includes(s.siteId)).map((s) => [s.siteId, s])),
    );
  }
}

/** Les jours qu'on a demandé de placer, sans rien placer. */
export class RecordingTransferPlacer extends TransferPlacer {
  readonly soon: string[] = [];
  readonly now: string[] = [];

  placeDay(day: string): Promise<number> {
    this.now.push(day);
    return Promise.resolve(0);
  }

  placeDaySoon(day: string): void {
    this.soon.push(day);
  }
}

/** Un transfert prévu de Val Village, ouvert à l'instant `at`. */
export function plannedTransfer(
  id: string,
  day: string,
  at: Date,
  orderIds: readonly string[] = [],
): InternalTransfer {
  const transfer = InternalTransfer.plan({
    id,
    serviceDay: day,
    siteId: "site_vv",
    siteLabel: "Val Village",
    at,
  });
  orderIds.forEach((orderId, index) => {
    transfer.attach(
      { itemId: `${id}_i${String(index + 1)}`, item: { kind: "order", orderId } },
      { siteId: "site_vv", serviceDay: day },
      at,
    );
  });
  return transfer;
}

/**
 * Un rangement des transferts réel, sur des doubles : sans retrait d'un site
 * servi par transfert (`refs` vide), il ne fait rien.
 */
export function attachmentOver(
  refs: readonly TransferOrderRef[] = [],
  transfers = new InMemoryInternalTransfers(),
  events = new RecordingPublisher(),
): TransferAttachment {
  return new TransferAttachment(
    new FixedTransferOrders(refs),
    transfers,
    new FixedIdGenerator("tr"),
    new FixedClock(new Date(0)),
    events,
  );
}

/** Les bacs de chaque transfert, comptés d'avance (lot T3) ; un transfert absent vaut 0. */
export class FixedTransferBinCounts extends TransferBinCounts {
  constructor(private readonly counts: ReadonlyMap<string, number> = new Map()) {
    super();
  }

  liveBinCounts(transferIds: readonly string[]): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(new Map(transferIds.map((id) => [id, this.counts.get(id) ?? 0])));
  }
}

/** Les transferts qui portent des commandes, donnés d'avance (lot T3). */
export class FixedCarriedOrderTransfers extends CarriedOrderTransfers {
  constructor(private readonly rows: ReadonlyMap<string, CarriedOrderTransferRow> = new Map()) {
    super();
  }

  carriedAmong(orderIds: readonly string[]): Promise<ReadonlyMap<string, CarriedOrderTransferRow>> {
    return Promise.resolve(
      new Map(
        orderIds.flatMap((id) => {
          const row = this.rows.get(id);
          return row === undefined ? [] : [[id, row] as const];
        }),
      ),
    );
  }
}
