import {
  TransactionalDurablePublisher,
  TransactionalUnitOfWork,
} from "../../../../platform/outbox/__tests__/transactional-durable.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import type { StoredDocument } from "../../../../platform/storage/document-store.js";
import { ProductionDocumentStore } from "../../../../platform/storage/production-document-store.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  type HandoverSubject,
  HandoverSubjectReader,
} from "../../../channels/commerce/handover-subject.reader.js";
import { OrderHandedOverEvent } from "../../../channels/commerce/order-handed-over.event.js";
import { HandoverProof } from "../../../domain/entities/handover-proof.js";
import { OrderHandover } from "../../../domain/entities/order-handover.js";
import { HandoverRefusedError } from "../../../domain/errors/handover-errors.js";
import { HandoverProofRepository } from "../../../domain/ports/handover-proof.repository.js";
import { OrderHandoverRepository } from "../../../domain/ports/order-handover.repository.js";
import { FixedQualityHolds } from "../../__tests__/fixed-quality-holds.js";
import { HandoverAttestation } from "../handover-attestation.service.js";
import { HandoverDoorstepAttestor } from "../handover-doorstep-attestor.js";

/*
 * Le retrait atteste une remise à la porte (plan-a-la-porte.md, B1, AP-D1) :
 * la règle du comptoir, et le fait durable écrit dans l'unité de travail du
 * livreur (lot E2) : il part avec sa validation, ou pas du tout.
 */

// Des instants recopiés, jamais comparés à l'horloge.
const AT = new Date(90_000);
const EARLIER = new Date(30_000);
const JPEG = { bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: "image/jpeg" };
const PNG = { bytes: Buffer.from([0x89, 0x50]), contentType: "image/png" };

function subjectOf(orderId: string, status: HandoverSubject["status"] = "ready"): HandoverSubject {
  return {
    orderId,
    orderNumber: `ORD-${orderId}`,
    placedByUserId: "usr_1",
    customerLabel: "Refuge 1950",
    placedAt: new Date(0),
    requestedDeliveryDate: null,
    pickupLabel: null,
    status,
    fulfillmentMethod: "delivery",
    note: "",
    lines: [],
  };
}

class FixedSubjects extends HandoverSubjectReader {
  constructor(private readonly subjects: readonly HandoverSubject[]) {
    super();
  }

  byToken(): Promise<HandoverSubject | null> {
    return Promise.resolve(null);
  }

  byReference(): Promise<HandoverSubject | null> {
    return Promise.resolve(null);
  }

  byOrderId(orderId: string): Promise<HandoverSubject | null> {
    return Promise.resolve(this.subjects.find((subject) => subject.orderId === orderId) ?? null);
  }
}

class InMemoryHandovers extends OrderHandoverRepository {
  readonly rows = new Map<string, OrderHandover>();

  findByOrderId(orderId: string): Promise<OrderHandover | null> {
    return Promise.resolve(this.rows.get(orderId) ?? null);
  }

  attest(handover: OrderHandover): Promise<boolean> {
    if (this.rows.has(handover.orderId)) {
      return Promise.resolve(false);
    }
    this.rows.set(handover.orderId, handover);
    return Promise.resolve(true);
  }
}

class InMemoryProofs extends HandoverProofRepository {
  readonly rows = new Map<string, HandoverProof>();

  findByOrderId(orderId: string): Promise<HandoverProof | null> {
    return Promise.resolve(this.rows.get(orderId) ?? null);
  }

  record(proof: HandoverProof): Promise<void> {
    this.rows.set(proof.state.orderId, proof);
    return Promise.resolve();
  }
}

class InMemoryStore extends ProductionDocumentStore {
  readonly objects = new Map<string, StoredDocument>();
  failOn: string | null = null;

  save(key: string, document: StoredDocument): Promise<string> {
    if (key === this.failOn) {
      return Promise.reject(new RangeError("stockage en panne"));
    }
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    return found === undefined
      ? Promise.reject(new RangeError(`absente : ${key}`))
      : Promise.resolve(found.bytes);
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key)?.bytes ?? null);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

function attestorOf(subjects: readonly HandoverSubject[] = [subjectOf("o_1")]) {
  const handovers = new InMemoryHandovers();
  const proofs = new InMemoryProofs();
  const store = new InMemoryStore();
  const uow = new TransactionalUnitOfWork();
  const clock = new FixedClock(AT);
  const attestation = new HandoverAttestation(
    handovers,
    clock,
    uow,
    new TransactionalDurablePublisher(uow),
    new FixedStaffAuthorDirectory(authorsKnownAs({ firstName: "Paul", lastName: "R" }, "paul")),
    new FixedQualityHolds(),
  );
  const attestor = new HandoverDoorstepAttestor(
    new FixedSubjects(subjects),
    attestation,
    handovers,
    proofs,
    store,
    new FixedIdGenerator("proof"),
    clock,
  );
  return { attestor, handovers, proofs, store, uow };
}

/** Le livreur : son unité de travail enveloppe le geste, comme `HandOverStopHandler`. */
function inCourierUnit<T>(uow: TransactionalUnitOfWork, work: () => Promise<T>): Promise<T> {
  return uow.run(work);
}

function factOf(at: Date, via: "manual" | "deposit", reannouncedAt: Date | null = null) {
  return new OrderHandedOverEvent("o_1", "ORD-o_1", at, "paul", via, reannouncedAt).durableFact();
}

const STAGED = { photoKey: "handover/proofs/p/photo", signatureKey: null };

describe("HandoverDoorstepAttestor — la remise à la porte (B1)", () => {
  it("range la photo et la signature sous le préfixe du retrait, et les retire sur demande", async () => {
    const { attestor, store } = attestorOf();

    const staged = await attestor.stageProofs({ photo: JPEG, signature: PNG });

    expect(staged).toEqual({
      photoKey: "handover/proofs/proof_000001/photo",
      signatureKey: "handover/proofs/proof_000001/signature",
    });
    expect([...store.objects.keys()]).toHaveLength(2);
    await attestor.discardProofs(staged);
    expect(store.objects.size).toBe(0);
  });

  it("une signature qui ne se range pas retire la photo déjà rangée", async () => {
    const { attestor, store } = attestorOf();
    store.failOn = "handover/proofs/proof_000001/signature";

    await expect(attestor.stageProofs({ photo: JPEG, signature: PNG })).rejects.toThrow(
      "stockage en panne",
    );
    expect(store.objects.size).toBe(0);
  });

  it("🔴 grave l'attestation `manual`, ses pièces et son fait durable dans l'unité du livreur", async () => {
    const { attestor, handovers, proofs, uow } = attestorOf();

    const publish = await inCourierUnit(uow, () =>
      attestor.attest({ orderId: "o_1", by: "paul", receiverName: "Mme Durand", proofs: STAGED }),
    );

    expect(handovers.rows.get("o_1")?.via).toBe("manual");
    expect(proofs.rows.get("o_1")?.state).toEqual({
      orderId: "o_1",
      receiverName: "Mme Durand",
      photoKey: STAGED.photoKey,
      signatureKey: null,
      recordedBy: "paul",
      recordedAt: AT,
    });
    expect(uow.of("handover.handed_over")).toEqual([factOf(AT, "manual")]);

    // La publication rendue à la livraison n'ajoute rien : le fait est déjà écrit.
    publish();
    expect(uow.committed).toHaveLength(1);
  });

  it("sans unité ouverte, l'attestation ouvre la sienne — jamais un fait sans transaction", async () => {
    const { attestor, uow } = attestorOf();

    await expect(
      attestor.attest({ orderId: "o_1", by: "paul", receiverName: "Mme D", proofs: STAGED }),
    ).resolves.toBeInstanceOf(Function);
    expect(uow.of("handover.handed_over")).toEqual([factOf(AT, "manual")]);
  });

  it("🔴 un dépôt sans personne (B2) : attesté `deposit`, sans nom, mêmes effets publiés", async () => {
    const { attestor, handovers, proofs, uow } = attestorOf();

    await inCourierUnit(uow, () =>
      attestor.attest({ orderId: "o_1", by: "paul", receiverName: null, proofs: STAGED }),
    );

    expect(handovers.rows.get("o_1")?.via).toBe("deposit");
    expect(proofs.rows.get("o_1")?.state.receiverName).toBeNull();
    expect(uow.of("handover.handed_over")).toEqual([factOf(AT, "deposit")]);
  });

  it("refuse avec la phrase du comptoir — et ne réannonce rien, l'unité va échouer", async () => {
    const { attestor, handovers, proofs, uow } = attestorOf([subjectOf("o_1", "cancelled")]);

    await expect(
      inCourierUnit(uow, () =>
        attestor.attest({ orderId: "o_1", by: "paul", receiverName: "Mme D", proofs: STAGED }),
      ),
    ).rejects.toThrow("Cette commande est annulée.");
    expect(handovers.rows.size).toBe(0);
    expect(proofs.rows.size).toBe(0);
    expect(uow.committed).toEqual([]);
  });

  it("refuse une commande que le commerce ne sert plus", async () => {
    const { attestor } = attestorOf([]);

    await expect(
      attestor.attest({ orderId: "o_1", by: "paul", receiverName: "Mme D", proofs: STAGED }),
    ).rejects.toThrow(HandoverRefusedError);
  });

  it("rejeu : réannonce l'attestation à la porte EXISTANTE — son heure, son auteur", async () => {
    const { attestor, handovers, proofs, uow } = attestorOf();
    handovers.rows.set("o_1", OrderHandover.rehydrate("o_1", "ORD-o_1", EARLIER, "paul", "manual"));
    proofs.rows.set(
      "o_1",
      HandoverProof.rehydrate({
        orderId: "o_1",
        receiverName: "Mme D",
        photoKey: STAGED.photoKey,
        signatureKey: null,
        recordedBy: "paul",
        recordedAt: EARLIER,
      }),
    );

    const publish = await inCourierUnit(uow, () => attestor.republication("o_1"));
    publish?.();

    // Un fait NEUF, sous la clé de l'instant du rejeu — l'heure du fait reste celle du retrait.
    expect(uow.of("handover.handed_over")).toEqual([factOf(EARLIER, "manual", AT)]);
  });

  it("rejeu : une remise au COMPTOIR n'est pas une remise à la porte — `null`", async () => {
    const { attestor, handovers } = attestorOf();
    handovers.rows.set("o_1", OrderHandover.rehydrate("o_1", "ORD-o_1", EARLIER, "ines", "scan"));

    expect(await attestor.republication("o_1")).toBeNull();
    expect(await attestor.republication("o_2")).toBeNull();
  });
});
