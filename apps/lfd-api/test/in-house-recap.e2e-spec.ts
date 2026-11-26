/**
 * E2E du **récapitulatif des BL** des restaurants maison
 * (`documentation/comptabilite/facturation/plan-restaurants-maison.md`, L3,
 * D7–D9), par la route machine du cron et les routes de la fiche client.
 *
 * Ce que seul le vrai SQL prouve :
 * - la fenêtre du mois clos à Paris, sur le BL COURANT remis ;
 * - un reliquat à cheval entre au mois de SA remise ;
 * - un BL non remis, ou d'une commande qui n'est pas interne, n'entre pas ;
 * - un mois vide s'écrit comme une issue, et n'est pas manqué ;
 * - le rejeu du passage ne réécrit rien (unicité de l'issue, index partiel) ;
 * - le rectificatif remplace l'ancien et libère ses BL dans une transaction.
 *
 * Une frontière doublée : la signature du jeton staff (le jeton EST le `sub`).
 */
import { E2E_STAFF_SUB, bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import {
  type InHouseBuyer,
  inHouseBuyer,
  inHouseSince,
  inLastClosedMonth,
  internalOrder,
  lastClosedMonth,
  runRecaps,
  seedNote,
} from "./in-house-recap-scene.js";
import { placeOrder, pickupSite } from "./order-factory.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";

/** Le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;
let resto: InHouseBuyer;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  resto = await inHouseBuyer(ctx, "auth0|resto-recap");
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

interface PayerList {
  readonly recaps: readonly {
    readonly id: string;
    readonly number: string;
    readonly month: string;
    readonly replacedById: string | null;
    readonly revisedNoteCount: number;
  }[];
  readonly emptyMonths: readonly string[];
  readonly missedMonths: readonly string[];
}

interface Detail {
  readonly lines: readonly {
    readonly sku: string;
    readonly quantity: number;
    readonly productName: string;
  }[];
  readonly notes: readonly { readonly deliveryNoteId: string; readonly revised: boolean }[];
  readonly replacedById: string | null;
}

async function listOf(companyId: string): Promise<PayerList> {
  return jsonBody(await staff().get(`/admin/companies/${companyId}/in-house-recaps`).expect(200));
}

async function detail(recapId: string): Promise<Detail> {
  return jsonBody(await staff().get(`/admin/in-house-recaps/${recapId}`).expect(200));
}

function issuedOf(report: Awaited<ReturnType<typeof runRecaps>>, payerId: string): string {
  const outcome = report.outcomes.find((one) => one.payerId === payerId);
  expect(outcome?.kind).toBe("issued");
  return outcome?.recapId ?? "";
}

describe("le passage mensuel", () => {
  it("🔴 un reliquat à cheval : le BL-1 au mois clos, le BL-2 au mois de SA remise", async () => {
    const orderId = await internalOrder(ctx, resto);
    const first = await seedNote(ctx, {
      orderId,
      rank: 1,
      handedOverAt: inLastClosedMonth(10),
      quantity: 4,
    });
    const remainder = await seedNote(ctx, {
      orderId,
      rank: 2,
      handedOverAt: daysAgo(0),
      quantity: 6,
    });

    const report = await runRecaps(ctx);

    expect(report.month).toBe(lastClosedMonth().key);
    const view = await detail(issuedOf(report, resto.companyId));
    expect(view.notes.map((note) => note.deliveryNoteId)).toEqual([first]);
    expect(view.notes.map((note) => note.deliveryNoteId)).not.toContain(remainder);
    expect(view.lines).toEqual([expect.objectContaining({ quantity: 4 })]);
  });

  it("🔴 un BL préparé mais non remis n'entre pas, ni celui d'une commande qui n'est pas interne", async () => {
    const orderId = await internalOrder(ctx, resto);
    await seedNote(ctx, { orderId, rank: 1, handedOverAt: inLastClosedMonth(5), quantity: 2 });
    const prepared = await seedNote(ctx, { orderId, rank: 2, handedOverAt: null, quantity: 9 });
    const outsider = await outsiderNote(inLastClosedMonth(5));

    const report = await runRecaps(ctx);

    const view = await detail(issuedOf(report, resto.companyId));
    const covered = view.notes.map((note) => note.deliveryNoteId);
    expect(covered).not.toContain(prepared);
    expect(covered).not.toContain(outsider);
    expect(view.lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(2);
    expect(await ctx.prisma.inHouseRecapNote.count({ where: { deliveryNoteId: outsider } })).toBe(
      0,
    );
  });

  it("🔴 un mois vide s'écrit comme une issue : ni manqué, ni récapitulatif", async () => {
    await inHouseSince(ctx, resto.companyId, inLastClosedMonth(2));

    const report = await runRecaps(ctx);

    expect(report.outcomes).toEqual([{ payerId: resto.companyId, kind: "empty" }]);
    const list = await listOf(resto.companyId);
    expect(list.recaps).toEqual([]);
    expect(list.emptyMonths).toEqual([lastClosedMonth().key]);
    expect(list.missedMonths).not.toContain(lastClosedMonth().key);
  });

  it("avant le passage, le mois clos d'un payeur maison est manqué", async () => {
    await inHouseSince(ctx, resto.companyId, inLastClosedMonth(2));

    expect((await listOf(resto.companyId)).missedMonths).toContain(lastClosedMonth().key);
  });

  it("🔴 rejoué, le passage se tait : une issue par (payeur, mois), un seul récapitulatif", async () => {
    await inHouseSince(ctx, resto.companyId, inLastClosedMonth(1));
    const orderId = await internalOrder(ctx, resto);
    await seedNote(ctx, { orderId, rank: 1, handedOverAt: inLastClosedMonth(3), quantity: 1 });
    await runRecaps(ctx);

    const again = await runRecaps(ctx);

    expect(again.outcomes).toEqual([{ payerId: resto.companyId, kind: "already_attempted" }]);
    expect(await ctx.prisma.inHouseRecap.count()).toBe(1);
    expect(await ctx.prisma.inHouseRecapRun.count()).toBe(1);
  });

  it("la base refuse qu'un BL soit dans deux récapitulatifs non remplacés", async () => {
    const orderId = await internalOrder(ctx, resto);
    const noteId = await seedNote(ctx, {
      orderId,
      rank: 1,
      handedOverAt: inLastClosedMonth(3),
      quantity: 1,
    });
    const recapId = issuedOf(await runRecaps(ctx), resto.companyId);
    const covered = await ctx.prisma.inHouseRecapNote.findFirstOrThrow({
      where: { deliveryNoteId: noteId },
    });

    await expect(
      ctx.prisma.inHouseRecapNote.create({
        data: { ...covered, id: `${covered.id}-bis`, recapId },
      }),
    ).rejects.toThrow();
  });
});

describe("le rectificatif (D8)", () => {
  it("🔴 un BL révisé est signalé ; « Réémettre » le remplace, rejouable sous la même intention", async () => {
    const orderId = await internalOrder(ctx, resto);
    const noteId = await seedNote(ctx, {
      orderId,
      rank: 1,
      handedOverAt: inLastClosedMonth(8),
      quantity: 3,
    });
    const original = issuedOf(await runRecaps(ctx), resto.companyId);
    await reviseNote(noteId, 5);

    const signalled = jsonBody<readonly { recapId: string }[]>(
      await staff().get("/admin/in-house-recaps/revised").expect(200),
    );
    expect(signalled.map((one) => one.recapId)).toEqual([original]);
    expect((await detail(original)).notes).toEqual([
      expect.objectContaining({ deliveryNoteId: noteId, revised: true }),
    ]);

    const key = freshIntent();
    const reissue = () =>
      staff().post(`/admin/in-house-recaps/${original}/reissue`).set(INTENT_KEY, key).send({});
    const rectified = jsonBody<{ id: string }>(await reissue().expect(201)).id;

    expect(jsonBody<{ id: string }>(await reissue().expect(201)).id).toBe(rectified);
    expect((await detail(original)).replacedById).toBe(rectified);
    expect((await detail(rectified)).lines).toEqual([expect.objectContaining({ quantity: 5 })]);
    expect((await detail(rectified)).notes).toEqual([
      expect.objectContaining({ deliveryNoteId: noteId, revised: false }),
    ]);
    const list = await listOf(resto.companyId);
    expect(list.recaps.map((one) => one.id).sort()).toEqual([original, rectified].sort());
    expect(await ctx.prisma.inHouseRecap.count()).toBe(2);
    expect(
      jsonBody<readonly unknown[]>(await staff().get("/admin/in-house-recaps/revised").expect(200)),
    ).toEqual([]);
  });

  it("réémettre un récapitulatif déjà remplacé est refusé par son nom", async () => {
    const orderId = await internalOrder(ctx, resto);
    await seedNote(ctx, { orderId, rank: 1, handedOverAt: inLastClosedMonth(8), quantity: 3 });
    const original = issuedOf(await runRecaps(ctx), resto.companyId);
    await staff()
      .post(`/admin/in-house-recaps/${original}/reissue`)
      .set(INTENT_KEY, freshIntent())
      .send({})
      .expect(201);

    const refused = await staff()
      .post(`/admin/in-house-recaps/${original}/reissue`)
      .set(INTENT_KEY, freshIntent())
      .send({})
      .expect(409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("in_house_recap.already_replaced");
  });
});

/** La révision d'un BL, comme l'écrit le dépôt des BL : sa version monte, ses lignes changent. */
async function reviseNote(noteId: string, quantity: number): Promise<void> {
  await ctx.prisma.deliveryNote.update({
    where: { id: noteId },
    data: { contentVersion: { increment: 1 } },
  });
  await ctx.prisma.deliveryNoteLine.updateMany({ where: { noteId }, data: { quantity } });
}

/** Un BL remis d'une commande au compte d'un autre client : il n'est pas interne. */
async function outsiderNote(at: string): Promise<string> {
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: "auth0|pas-maison" });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  const placed = await placeOrder(ctx, {
    buyerUserId: buyer.id,
    companyId: company.id,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: "VIE-001-1", quantity: 9 }],
  });
  return seedNote(ctx, { orderId: placed.id, rank: 1, handedOverAt: at, quantity: 9 });
}
