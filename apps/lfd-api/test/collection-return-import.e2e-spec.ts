/**
 * E2E des retours bancaires — **l'import d'un fichier de la banque** (R5b),
 * et le droit.
 *
 * Découpé de `collection-returns.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `collection-returns-scene.ts`.
 */
import type {
  CollectionReturnImportPreviewView,
  CollectionReturnImportResultView,
} from "@lfd/contracts";
import {
  camt054,
  pain002,
} from "../src/b2b/accounting/domain/services/__tests__/bank-return-file-fixtures.js";
import { daysAgo, jsonBody } from "./e2e-harness.js";
import { invoicedPayer, readerStaff, setUpEntity } from "./collection-returns-scene.js";
import {
  closesAt,
  ctx,
  depositedLine,
  RETURNS,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";

useCollectionReturnScene();

describe("l'import d'un fichier de la banque (R5b)", () => {
  function upload(path: string, xml: string, ids?: readonly string[]) {
    const request = staff()
      .post(`${RETURNS}/import/${path}`)
      .attach("file", Buffer.from(xml), "retours.xml");
    return ids === undefined ? request : request.field("endToEndIds", JSON.stringify(ids));
  }

  it("pain.002 : aperçu (apparié, inconnu), confirmation, puis « déjà retourné »", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    const { e2e } = await depositedLine(entityId);
    const line = await ctx.prisma.collectionBatchLine.findFirstOrThrow();
    const amount = (line.amountCents / 100).toFixed(2);
    const xml = pain002(daysAgo(1).slice(0, 10), [
      { endToEndId: e2e, amount, code: "AC04" },
      { endToEndId: "INCONNU-1", amount: "1.00", code: "AM04" },
    ]);

    const preview = jsonBody<CollectionReturnImportPreviewView>(
      await upload("preview", xml).expect(200),
    );
    expect(preview.entries.map((entry) => [entry.endToEndId, entry.status])).toEqual([
      [e2e, "matched"],
      ["INCONNU-1", "unknown"],
    ]);
    await upload("confirm", xml, [e2e]).expect(201);
    expect(await ctx.prisma.collectionReturn.findFirstOrThrow()).toMatchObject({
      source: "pain002",
      reasonCode: "AC04",
    });

    const again = jsonBody<CollectionReturnImportPreviewView>(
      await upload("preview", xml).expect(200),
    );
    expect(again.entries[0]?.status).toBe("already_returned");
  });

  it("la confirmation rend son compte rendu : lues, enregistrées, introuvables avec leur RUM", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    const { e2e } = await depositedLine(entityId);
    const line = await ctx.prisma.collectionBatchLine.findFirstOrThrow();
    const amount = (line.amountCents / 100).toFixed(2);
    const xml = pain002(daysAgo(1).slice(0, 10), [
      { endToEndId: e2e, amount, code: "AC04" },
      { endToEndId: "INCONNU-1", amount: "1.00", code: "AM04", mandate: "RUM-PERDUE" },
    ]);

    const result = jsonBody<CollectionReturnImportResultView>(
      await upload("confirm", xml, [e2e]).expect(201),
    );

    expect(result.recordedIds).toHaveLength(1);
    expect(result.report).toMatchObject({
      format: "pain002",
      readCount: 2,
      recordedCount: 1,
      alreadyRecordedCount: 0,
      notFound: [
        {
          endToEndId: "INCONNU-1",
          mandateReference: "RUM-PERDUE",
          amountCents: 100,
          returnedOn: daysAgo(1).slice(0, 10),
        },
      ],
      setAside: [],
    });
  });

  it("camt.054 : un montant différent est signalé et ne se confirme pas", async () => {
    const entityId = await setUpEntity(staff);
    await invoicedPayer(ctx, staff, entityId, closesAt);
    const { e2e } = await depositedLine(entityId);
    const xml = camt054(daysAgo(1).slice(0, 10), [
      { endToEndId: e2e, amount: "1.00", code: "AM04" },
    ]);

    const preview = jsonBody<CollectionReturnImportPreviewView>(
      await upload("preview", xml).expect(200),
    );
    expect(preview).toMatchObject({ format: "camt054", entries: [{ status: "amount_mismatch" }] });
    await upload("confirm", xml, [e2e]).expect(409);
    expect(await ctx.prisma.collectionReturn.count()).toBe(0);
  });
});

describe("le droit", () => {
  it("lecture seule : lit les retours, 403 sur la saisie, la résolution et l'import ; sans droit : 403", async () => {
    await readerStaff(ctx, "staff-lecture", "read");
    await readerStaff(ctx, "staff-sans-droit", null);
    const reader = ctx.asSub("staff-lecture");

    await reader.get(`${RETURNS}/batches/lot_x`).expect(200);
    await reader.get(`${RETURNS}/payers/co_x`).expect(200);
    await reader
      .post(`${RETURNS}/batches/lot_x/lines/1`)
      .send({
        kind: "reject",
        reasonCode: "AM04",
        reasonLabel: null,
        returnedOn: daysAgo(1).slice(0, 10),
        feeCents: null,
      })
      .expect(403);
    await reader.post(`${RETURNS}/ret_x/represent`).expect(403);
    await reader.post(`${RETURNS}/ret_x/write-off`).send({ note: "x" }).expect(403);
    await reader
      .post(`${RETURNS}/import/preview`)
      .attach("file", Buffer.from("<a/>"), "x.xml")
      .expect(403);
    await ctx.asSub("staff-sans-droit").get(`${RETURNS}/batches/lot_x`).expect(403);
  });
});
