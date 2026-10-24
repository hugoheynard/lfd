import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  CollectionBatchAttestations,
  type AttestedBatch,
  type BatchAttestationEntry,
} from "../../../domain/entities/collection-batch-attestation.js";
import type { CollectionBatchStatus } from "../../../domain/entities/collection-batch-status.js";
import {
  BatchAttestationAlreadyGivenError,
  BatchAttestationNotGivenError,
  BatchAttestationOutOfOrderError,
} from "../../../domain/errors/collection-batch-attestation-errors.js";
import { CollectionBatchNotFoundError } from "../../../domain/errors/collection-errors.js";
import { CollectionBatchAttestationRepository } from "../../../domain/ports/collection-batch-attestation.repository.js";
import { AttestCollectionBatchCommand } from "../attest-collection-batch.command.js";
import { AttestCollectionBatchHandler } from "../attest-collection-batch.handler.js";
import { WithdrawCollectionBatchAttestationCommand } from "../withdraw-collection-batch-attestation.command.js";
import { WithdrawCollectionBatchAttestationHandler } from "../withdraw-collection-batch-attestation.handler.js";
import { NOW, OneEntity, entityRecord } from "./mandate-bank-export-doubles.js";

/** Le registre en mémoire : les lignes s'ajoutent, aucune ne se modifie. */
class MemoryAttestations extends CollectionBatchAttestationRepository {
  readonly rows: BatchAttestationEntry[] = [];

  constructor(readonly batches: Map<string, AttestedBatch>) {
    super();
  }

  load(batchId: string): Promise<CollectionBatchAttestations | null> {
    const batch = this.batches.get(batchId);
    return Promise.resolve(
      batch === undefined
        ? null
        : CollectionBatchAttestations.rehydrate({
            batch,
            entries: this.rows.filter((row) => row.batchId === batchId),
          }),
    );
  }

  save(attestations: CollectionBatchAttestations): Promise<void> {
    this.rows.push(...attestations.newEntries());
    return Promise.resolve();
  }
}

function world(status: CollectionBatchStatus = "deposited", clock = new FixedClock(NOW)) {
  const entities = new OneEntity(entityRecord());
  const batch: AttestedBatch = {
    id: "b1",
    legalEntityId: entities.record.id,
    scheme: "CORE",
    status,
    cycleClosesAt: new Date("2026-09-30T22:00:00.000Z"),
  };
  const attestations = new MemoryAttestations(new Map([["b1", batch]]));
  const events = new RecordingPublisher();
  const ids = new FixedIdGenerator();
  const uow = new DirectUnitOfWork();
  return {
    entityId: entities.record.id,
    attestations,
    events,
    attest: new AttestCollectionBatchHandler(entities, attestations, ids, clock, events, uow),
    withdraw: new WithdrawCollectionBatchAttestationHandler(
      entities,
      attestations,
      ids,
      clock,
      events,
      uow,
    ),
  };
}

describe("les attestations du lot — attester (P3)", () => {
  it("pose la ligne avec son auteur, et la journalise sous l'entité, le lot nommé", async () => {
    const w = world();

    await w.attest.execute(new AttestCollectionBatchCommand("b1", "remittance_signed", "staff_1"));

    expect(w.attestations.rows).toEqual([
      expect.objectContaining({ kind: "remittance_signed", at: NOW, staffId: "staff_1" }),
    ]);
    expect(w.events.factTypes()).toEqual(["collection_batch_attestation.attested"]);
    expect(w.events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "legal_entity",
      subjectId: w.entityId,
      payload: { batch: { id: "b1", name: "Lot CORE 20260930" }, kind: "remittance_signed" },
    });
  });

  it("refuse une seconde attestation de la même sorte, sans rien écrire ni journaliser", async () => {
    const w = world();
    await w.attest.execute(new AttestCollectionBatchCommand("b1", "psr_read", "staff_1"));

    await expect(
      w.attest.execute(new AttestCollectionBatchCommand("b1", "psr_read", "staff_2")),
    ).rejects.toThrow(BatchAttestationAlreadyGivenError);
    expect(w.attestations.rows).toHaveLength(1);
    expect(w.events.factTypes()).toEqual(["collection_batch_attestation.attested"]);
  });

  it("la remise ne se signe pas sur un lot pas encore déposé", async () => {
    const w = world("constituted");

    await expect(
      w.attest.execute(new AttestCollectionBatchCommand("b1", "remittance_signed", "s")),
    ).rejects.toThrow(BatchAttestationOutOfOrderError);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("un lot inconnu est un 404 qui le nomme", async () => {
    const w = world();
    await expect(
      w.attest.execute(new AttestCollectionBatchCommand("ailleurs", "psr_read", "s")),
    ).rejects.toThrow(CollectionBatchNotFoundError);
  });
});

describe("les attestations du lot — retirer (la dernière ligne fait foi)", () => {
  it("ajoute une ligne de retrait avec sa note, et rien ne s'efface", async () => {
    const w = world();
    await w.attest.execute(new AttestCollectionBatchCommand("b1", "remittance_signed", "staff_1"));

    await w.withdraw.execute(
      new WithdrawCollectionBatchAttestationCommand("b1", "remittance_signed", "pas signé", "s2"),
    );

    expect(w.attestations.rows.map((row) => [row.withdrawn, row.note])).toEqual([
      [false, null],
      [true, "pas signé"],
    ]);
    expect((await w.attestations.load("b1"))?.standing("remittance_signed")).toBeNull();
    expect(w.events.factTypes()).toEqual([
      "collection_batch_attestation.attested",
      "collection_batch_attestation.withdrawn",
    ]);
    expect(w.events.traced[1]?.journalFact().payload).toMatchObject({ note: "pas signé" });
  });

  it("refuse de retirer ce qui n'est pas attesté", async () => {
    const w = world();
    await expect(
      w.withdraw.execute(new WithdrawCollectionBatchAttestationCommand("b1", "psr_read", "x", "s")),
    ).rejects.toThrow(BatchAttestationNotGivenError);
    expect(w.events.factTypes()).toEqual([]);
  });
});
