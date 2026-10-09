import { NothingToCollectError } from "../../../domain/errors/collection-errors.js";
import { CollectionNoticesNotSentError } from "../../../domain/errors/collection-notice-errors.js";
import {
  ENTITY_ID,
  STAFF_AUTHOR,
  mandate,
  order,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import { CancelCollectionBatchCommand } from "../cancel-collection-batch.command.js";
import { ConstituteCollectionBatchesCommand } from "../constitute-collection-batches.command.js";
import { DepositCollectionBatchCommand } from "../deposit-collection-batch.command.js";
import { world } from "./collection-world.js";
import { sendAllQueued } from "./notice-doubles.js";

/**
 * L'avis de prélèvement, à travers les handlers (PA2). Les instants viennent
 * de l'horloge fixe du monde (`AFTER_CLOSE`, lendemain de la clôture du
 * 1er octobre 2026) : comparés au cycle, jamais au mur.
 */

type World = ReturnType<typeof world>;

async function constitute(w: World): Promise<string> {
  const [id] = await w.constitute.execute(
    new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
  );
  return id ?? "";
}

/** Annuler, puis rendre aux candidats l'état d'encaissement que l'annulation a écrit. */
async function cancel(w: World, batchId: string): Promise<void> {
  await w.cancel.execute(new CancelCollectionBatchCommand(batchId, "staff_1"));
  w.candidates.orders = w.candidates.orders.map((o) => ({
    ...o,
    collection: w.orders.saved.get(o.orderId)?.toPersistence() ?? null,
  }));
}

function noticesOf(w: World) {
  return w.noticeStore.notices.map((notice) => notice.toPersistence());
}

describe("l'avis de prélèvement, à la constitution", () => {
  it("un avis par ligne, en file dans la boîte d'envoi, avec le montant de l'arrêté et l'échéance du lot", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];

    const batchId = await constitute(w);

    const batch = w.batches.saved.get(batchId)?.toPersistence();
    const statement = w.statements.inserted[0]?.toPersistence();
    expect(noticesOf(w)).toEqual([
      expect.objectContaining({
        kind: "notice",
        status: "queued",
        recipient: { email: "compta@c_port.test", source: "billing_contact" },
        terms: {
          amountCents: statement?.totalTtcCents,
          collectionDay: batch?.requestedCollectionDay,
        },
        mandateReference: "RUM-c_port",
        line: {
          batchId,
          lineRank: 1,
          statementId: statement?.id,
          invoiceNumbers: [],
          representedRejectionDay: null,
        },
        creditor: { name: "Crazeativity", ics: "FR00ZZZ900001" },
      }),
    ]);
    const noticeId = w.noticeStore.notices[0]?.id ?? "";
    expect(w.durable.facts).toEqual([
      {
        type: "collection.notice_to_send",
        key: `collection.notice_to_send:${noticeId}`,
        payload: { noticeId },
      },
    ]);
  });

  /**
   * D4 : constitué le lendemain de la clôture, l'échéance recule d'un jour
   * pour tenir les 14 jours ; le lot, le XML et l'avis portent la même date.
   */
  it("constitution tardive : l'échéance est repoussée, et le XML comme l'avis la portent", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];

    const batchId = await constitute(w);

    const batch = w.batches.saved.get(batchId)?.toPersistence();
    expect(batch).toMatchObject({
      requestedCollectionDay: "2026-10-16",
      postponedFromDay: "2026-10-15",
    });
    expect(batch?.xml).toContain("<ReqdColltnDt>2026-10-16</ReqdColltnDt>");
    expect(noticesOf(w)[0]?.terms.collectionDay).toBe("2026-10-16");
  });

  it("sans contact de facturation : au détenteur ; sans l'un ni l'autre : non envoyable, rien en file", async () => {
    const w = world();
    w.candidates.orders = [order("c_port"), order("c_chalet")];
    w.mandates.mandates = [mandate("c_port"), mandate("c_chalet")];
    w.contacts.overrides.set("c_port", {
      billingContactEmails: [],
      ownerEmail: "patron@port.test",
    });
    w.contacts.overrides.set("c_chalet", { billingContactEmails: [], ownerEmail: null });

    await constitute(w);

    const byDebtor = new Map(noticesOf(w).map((notice) => [notice.debtorCompanyId, notice]));
    expect(byDebtor.get("c_port")).toMatchObject({
      status: "queued",
      recipient: { email: "patron@port.test", source: "owner" },
    });
    expect(byDebtor.get("c_chalet")).toMatchObject({ status: "unsendable", recipient: null });
    expect(w.durable.facts).toHaveLength(1);
    expect(w.events.factTypes()).toEqual(
      expect.arrayContaining(["collection.notice_queued", "collection.notice_unsendable"]),
    );
  });
});

describe("« Marquer déposé » exige les avis envoyés", () => {
  it("en file : refusé, en nommant le payeur ; envoyé : déposé", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const batchId = await constitute(w);
    w.recheck.now = new Map([["m_c_port", { active: true, iban: mandate("c_port").iban }]]);

    const refusal = w.deposit.execute(new DepositCollectionBatchCommand(batchId, "staff_1"));

    await expect(refusal).rejects.toThrow(CollectionNoticesNotSentError);
    await expect(refusal).rejects.toThrow("Société c_port (avis en file, pas encore envoyé)");
    expect(w.batches.saved.get(batchId)?.status).toBe("constituted");

    sendAllQueued(w.noticeStore, w.clock.now());
    await w.deposit.execute(new DepositCollectionBatchCommand(batchId, "staff_1"));
    expect(w.batches.saved.get(batchId)?.status).toBe("deposited");
  });

  it("non envoyable : refusé, avec le geste de sortie", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    w.contacts.overrides.set("c_port", { billingContactEmails: [], ownerEmail: null });
    const batchId = await constitute(w);
    w.recheck.now = new Map([["m_c_port", { active: true, iban: mandate("c_port").iban }]]);

    await expect(
      w.deposit.execute(new DepositCollectionBatchCommand(batchId, "staff_1")),
    ).rejects.toThrow(/Société c_port \(aucune adresse.*renseigner un contact de facturation/u);
  });
});

describe("annuler puis reconstituer : un avis parti se corrige", () => {
  it("identique : reconduit, rien ne repart, et le nouveau lot se dépose", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const first = await constitute(w);
    sendAllQueued(w.noticeStore, w.clock.now());
    await cancel(w, first);
    w.durable.facts.length = 0;

    const second = await constitute(w);

    expect(noticesOf(w)[1]).toMatchObject({ kind: "unchanged", status: "sent" });
    expect(w.durable.facts).toHaveLength(0);
    w.recheck.now = new Map([["m_c_port", { active: true, iban: mandate("c_port").iban }]]);
    await w.deposit.execute(new DepositCollectionBatchCommand(second, "staff_1"));
    expect(w.batches.saved.get(second)?.status).toBe("deposited");
  });

  it("montant changé : un rectificatif en file, qui dit l'ancien montant", async () => {
    const w = world();
    const kept = order("c_port");
    w.candidates.orders = [kept, order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const first = await constitute(w);
    const before = noticesOf(w)[0]?.terms.amountCents;
    sendAllQueued(w.noticeStore, w.clock.now());
    await cancel(w, first);
    w.candidates.orders = w.candidates.orders.filter((o) => o.orderId === kept.orderId);

    await constitute(w);

    expect(noticesOf(w)[1]).toMatchObject({
      kind: "correction",
      status: "queued",
      previous: { amountCents: before },
      supersedesId: noticesOf(w)[0]?.id,
    });
    expect(w.durable.facts).toHaveLength(2);
  });

  it("payeur qui n'est plus prélevé : une annulation part", async () => {
    const w = world();
    w.candidates.orders = [order("c_port"), order("c_chalet")];
    w.mandates.mandates = [mandate("c_port"), mandate("c_chalet")];
    const first = await constitute(w);
    sendAllQueued(w.noticeStore, w.clock.now());
    await cancel(w, first);
    w.candidates.orders = w.candidates.orders.filter((o) => o.companyId === "c_port");

    await constitute(w);

    const cancellation = noticesOf(w).find((notice) => notice.kind === "cancellation");
    expect(cancellation).toMatchObject({
      debtorCompanyId: "c_chalet",
      status: "queued",
      line: null,
    });
  });

  it("plus aucun lot, tout écarté : l'annulation part quand même, sans 409", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const first = await constitute(w);
    sendAllQueued(w.noticeStore, w.clock.now());
    await cancel(w, first);
    w.mandates.mandates = [];
    w.durable.facts.length = 0;

    const batchIds = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
    );

    expect(batchIds).toEqual([]);
    expect(noticesOf(w)[1]).toMatchObject({
      kind: "cancellation",
      status: "queued",
      line: null,
      debtorCompanyId: "c_port",
      supersedesId: noticesOf(w)[0]?.id,
    });
    expect(w.durable.facts).toHaveLength(1);
  });

  it("plus rien à prélever : l'annulation part, et la préparation suivante refuse", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const first = await constitute(w);
    sendAllQueued(w.noticeStore, w.clock.now());
    await cancel(w, first);
    w.candidates.orders = [];

    await expect(
      w.constitute.execute(new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR)),
    ).resolves.toEqual([]);
    expect(noticesOf(w).map((notice) => notice.kind)).toEqual(["notice", "cancellation"]);
    sendAllQueued(w.noticeStore, w.clock.now());

    await expect(
      w.constitute.execute(new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR)),
    ).rejects.toThrow(NothingToCollectError);
  });
});
