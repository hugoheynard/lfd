import type {
  RecordedTransferView,
  TransferAllocationView,
  TransferToRecord,
} from "../../../channels/requests/bank-transfers.js";
import type { MovementSubject } from "../../../channels/subjects/movement-subject.js";
import type { ReceivedTransfer } from "../../domain/entities/received-transfer.js";
import { InvalidReceivedTransferError } from "../../domain/errors/received-transfer-errors.js";
import { ReceivedTransferRepository } from "../../domain/ports/received-transfer.repository.js";
import { RecordedTransfersReader } from "../../domain/ports/recorded-transfers.reader.js";
import { TransferAllocationsReader } from "../../domain/ports/transfer-allocations.reader.js";
import { BlockBankTransfers } from "../block-bank-transfers.js";

class MemoryTransfers extends ReceivedTransferRepository {
  readonly added: ReceivedTransfer[] = [];
  add(transfer: ReceivedTransfer): Promise<void> {
    this.added.push(transfer);
    return Promise.resolve();
  }
}

class FixedAllocations extends TransferAllocationsReader {
  readonly asked: (readonly MovementSubject[])[] = [];
  constructor(private readonly rows: readonly TransferAllocationView[]) {
    super();
  }
  allocationsOf(subjects: readonly MovementSubject[]): Promise<readonly TransferAllocationView[]> {
    this.asked.push(subjects);
    return Promise.resolve(this.rows);
  }
}

class FixedRecorded extends RecordedTransfersReader {
  readonly since: Date[] = [];
  constructor(private readonly rows: readonly RecordedTransferView[]) {
    super();
  }
  recordedSince(since: Date): Promise<readonly RecordedTransferView[]> {
    this.since.push(since);
    return Promise.resolve(this.rows);
  }
}

const AT = new Date(0);
const TRANSFER: TransferToRecord = {
  id: "vir_1",
  receivedInto: "le1",
  payerRef: "cmp_port",
  amountCents: 1_000,
  receivedOn: "2026-11-18",
  reference: "VIR",
  recordedAt: AT,
  recordedBy: "staff_compta",
  parts: [{ subject: { type: "invoice", id: "inv_1" }, amountCents: 1_000 }],
};

function block(allocations: readonly TransferAllocationView[] = []) {
  const transfers = new MemoryTransfers();
  const reader = new FixedAllocations(allocations);
  const recorded = new FixedRecorded([]);
  return {
    transfers,
    reader,
    recorded,
    port: new BlockBankTransfers(transfers, reader, recorded),
  };
}

describe("BlockBankTransfers — la porte du virement reçu", () => {
  it("juge par l'agrégat puis ajoute le virement", async () => {
    const { transfers, port } = block();

    await port.record(TRANSFER);

    expect(transfers.added.map((transfer) => transfer.toState())).toEqual([TRANSFER]);
  });

  it("une répartition fausse est refusée avant d'écrire", async () => {
    const { transfers, port } = block();

    await expect(port.record({ ...TRANSFER, amountCents: 999 })).rejects.toBeInstanceOf(
      InvalidReceivedTransferError,
    );
    expect(transfers.added).toEqual([]);
  });

  it("rend les parts rangées par sujet, type compris", async () => {
    const allocation: TransferAllocationView = {
      transferId: "vir_1",
      subject: { type: "invoice", id: "inv_1" },
      amountCents: 1_000,
      receivedOn: "2026-11-18",
    };
    const { port } = block([allocation]);

    const found = await port.allocationsOf([{ type: "invoice", id: "inv_1" }]);

    expect([...found]).toEqual([["invoice/inv_1", allocation]]);
  });

  it("aucun sujet demandé : aucune lecture", async () => {
    const { reader, port } = block();

    expect((await port.allocationsOf([])).size).toBe(0);
    expect(reader.asked).toEqual([]);
  });

  it("relaie l'instant de départ des virements enregistrés", async () => {
    const { recorded, port } = block();

    await port.recordedSince(AT);

    expect(recorded.since).toEqual([AT]);
  });
});
