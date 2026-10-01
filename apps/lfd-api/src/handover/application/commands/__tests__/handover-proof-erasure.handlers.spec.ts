import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { HandoverProof } from "../../../domain/entities/handover-proof.js";
import {
  HandoverProofPurgeIncompleteError,
  HandoverProofRetentionInvalidError,
} from "../../../domain/errors/handover-proof-errors.js";
import { HandoverProofErasure } from "../../services/handover-proof-erasure.js";
import { EraseHandoverProofsCommand } from "../erase-handover-proofs.command.js";
import { EraseHandoverProofsHandler } from "../erase-handover-proofs.handler.js";
import { PurgeHandoverProofsOlderThanCommand } from "../purge-handover-proofs-older-than.command.js";
import { PurgeHandoverProofsOlderThanHandler } from "../purge-handover-proofs-older-than.handler.js";
import {
  InMemoryProofEraser,
  InMemoryProofRepository,
  InMemoryProofStore,
  NumberedSubjects,
  ProofRows,
} from "./handover-proof-doubles.js";

/*
 * La purge et l'effacement des pièces de remise (todo-la-porte.md, 2026-10-01) :
 * les images d'abord, la ligne et son fait ensuite ; une image que le stockage
 * refuse garde la pièce entière.
 */

const DAY = 86_400_000;
// L'horloge du test : les âges des pièces s'y rapportent, aucun jour du calendrier.
const NOW = new Date(1_000 * DAY);
const JPEG = { bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: "image/jpeg" };

function scene() {
  const table = new ProofRows();
  const store = new InMemoryProofStore();
  const eraser = new InMemoryProofEraser(table);
  const events = new RecordingPublisher();
  const erasure = new HandoverProofErasure(
    eraser,
    store,
    new NumberedSubjects({ o_old: "ORD-0001", o_signed: "ORD-0002" }),
    events,
    new DirectUnitOfWork(),
  );
  const purge = new PurgeHandoverProofsOlderThanHandler(eraser, erasure, new FixedClock(NOW));
  const erase = new EraseHandoverProofsHandler(new InMemoryProofRepository(table), erasure);
  const add = (orderId: string, ageDays: number, signed = false): HandoverProof => {
    const proof = HandoverProof.rehydrate({
      orderId,
      receiverName: signed ? "Mme Durand" : null,
      photoKey: `handover/proofs/${orderId}/photo`,
      signatureKey: signed ? `handover/proofs/${orderId}/signature` : null,
      recordedBy: "stf_paul",
      recordedAt: new Date(NOW.getTime() - ageDays * DAY),
    });
    table.rows.set(orderId, proof);
    for (const key of proof.imageKeys()) {
      store.objects.set(key, JPEG);
    }
    return proof;
  };
  return { table, store, eraser, events, purge, erase, add };
}

describe("PurgeHandoverProofsOlderThanHandler", () => {
  it("efface ce qui a dépassé la durée — ligne et images — et garde le reste", async () => {
    const s = scene();
    s.add("o_old", 120);
    s.add("o_signed", 95, true);
    s.add("o_recent", 10);

    await s.purge.execute(new PurgeHandoverProofsOlderThanCommand(90));

    expect([...s.table.rows.keys()]).toEqual(["o_recent"]);
    expect([...s.store.objects.keys()]).toEqual(["handover/proofs/o_recent/photo"]);
    expect(s.events.factTypes()).toEqual([
      "order_handover_proof.erased",
      "order_handover_proof.erased",
    ]);
  });

  it("écrit un fait sans donnée personnelle : numéro, date de prise, signature, cause", async () => {
    const s = scene();
    const proof = s.add("o_signed", 95, true);

    await s.purge.execute(new PurgeHandoverProofsOlderThanCommand(90));

    const fact = s.events.traced[0]?.journalFact();
    expect(fact).toEqual({
      type: "order_handover_proof.erased",
      subjectType: "order",
      subjectId: "o_signed",
      payload: {
        subjectLabel: "ORD-0002",
        recordedAt: proof.state.recordedAt.toISOString(),
        signed: true,
        cause: "retention",
      },
    });
    expect(JSON.stringify(fact)).not.toContain("Durand");
    expect(JSON.stringify(fact)).not.toContain("handover/proofs");
  });

  it("garde entière une pièce dont une image résiste, efface les autres, et le dit", async () => {
    const s = scene();
    s.add("o_old", 120);
    s.add("o_signed", 95, true);
    s.store.failOn.add("handover/proofs/o_signed/signature");

    await expect(s.purge.execute(new PurgeHandoverProofsOlderThanCommand(90))).rejects.toThrow(
      HandoverProofPurgeIncompleteError,
    );

    expect([...s.table.rows.keys()]).toEqual(["o_signed"]);
    expect(s.events.traced.map((event) => event.journalFact().subjectId)).toEqual(["o_old"]);

    // Le stockage rétabli, relancer reprend exactement ce qui reste.
    s.store.failOn.clear();
    await s.purge.execute(new PurgeHandoverProofsOlderThanCommand(90));
    expect(s.table.rows.size).toBe(0);
    expect(s.store.objects.size).toBe(0);
  });

  it("refuse une durée de moins d'un jour, sans rien lire", async () => {
    const s = scene();
    s.add("o_recent", 0);

    await expect(s.purge.execute(new PurgeHandoverProofsOlderThanCommand(0))).rejects.toThrow(
      HandoverProofRetentionInvalidError,
    );
    expect(s.table.rows.size).toBe(1);
  });
});

describe("EraseHandoverProofsHandler", () => {
  it("efface les pièces d'une commande, quel que soit leur âge", async () => {
    const s = scene();
    s.add("o_signed", 1, true);
    s.add("o_old", 120);

    await s.erase.execute(new EraseHandoverProofsCommand("o_signed"));

    expect([...s.table.rows.keys()]).toEqual(["o_old"]);
    expect([...s.store.objects.keys()]).toEqual(["handover/proofs/o_old/photo"]);
    expect(s.events.traced[0]?.journalFact().payload).toMatchObject({ cause: "request" });
  });

  it("ne fait rien, sans fait, pour une commande sans pièce : rejouer est sans effet", async () => {
    const s = scene();
    s.add("o_signed", 1, true);
    await s.erase.execute(new EraseHandoverProofsCommand("o_signed"));

    await s.erase.execute(new EraseHandoverProofsCommand("o_signed"));

    expect(s.events.traced).toHaveLength(1);
  });

  it("garde la ligne si le stockage refuse : sans elle, les images seraient orphelines", async () => {
    const s = scene();
    s.add("o_signed", 1, true);
    s.store.failOn.add("handover/proofs/o_signed/signature");

    await expect(s.erase.execute(new EraseHandoverProofsCommand("o_signed"))).rejects.toThrow(
      RangeError,
    );

    expect(s.table.rows.has("o_signed")).toBe(true);
    expect(s.eraser.erased).toEqual([]);
    expect(s.events.traced).toHaveLength(0);
  });

  it("cite la commande par son seul identifiant quand le commerce ne la connaît plus", async () => {
    const s = scene();
    s.add("o_gone", 1);

    await s.erase.execute(new EraseHandoverProofsCommand("o_gone"));

    expect(s.events.traced[0]?.journalFact().payload).not.toHaveProperty("subjectLabel");
  });
});
