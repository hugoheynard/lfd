/**
 * **Les versions du plan de production** (`documentation/fournil/les-versions-du-plan.md`) — sur le vrai Postgres, de la route au registre :
 * arrêt → révision → annulation après l'arrêt → retirage → réouverture →
 * arrêt. Chaque geste qui change le plan figé garde une version, dans sa
 * transaction ; la réouverture n'en garde pas ; `production_day.plan_version`
 * suit la dernière.
 */
import { DeferredTerm } from "../src/platform/database/client/client.js";
import { E2E_STAFF_ID, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { customerCancel, personalPickup, setStage } from "./order-cancel-after-plan-scene.js";
import { pickupSite, placeOrderForCustomer } from "./order-factory.js";
import { reviseQuantity } from "./order-revise-after-plan-scene.js";
import {
  CROISSANT,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  relayGate,
  releaseRelay,
  retake,
} from "./production-day-fixture.js";
import { placeLateByStaff } from "./staff-late-order.js";

const ACCOUNT_BUYER = "auth0|plan-versions-pro";

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  relayGate.open = true;
  await ctx.close();
});

beforeEach(async () => {
  relayGate.open = true;
  await ctx.reset();
});

/** Une commande au compte d'un pro, que l'équipe peut réviser après l'arrêt (A2). */
async function accountPickup(): Promise<string> {
  const company = await createCompany(ctx.prisma);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: ACCOUNT_BUYER });
  await attachTo(ctx.prisma, buyer.id, company.id);
  const placed = await placeOrderForCustomer(ctx, {
    buyerUserId: buyer.id,
    companyId: company.id,
    staffUserId: E2E_STAFF_ID,
    settlement: "account",
    forDay: SERVICE_DAY,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: CROISSANT, quantity: 3 }],
  });
  return placed.id;
}

interface StoredShipment {
  readonly orderId: string;
  readonly entry: string;
  readonly offPlan: boolean | null;
}

function shipmentsOf(content: unknown): readonly StoredShipment[] {
  if (typeof content !== "object" || content === null || !("shipments" in content)) {
    return [];
  }
  const { shipments } = content;
  return Array.isArray(shipments) ? shipments.filter(isShipment) : [];
}

function isShipment(value: unknown): value is StoredShipment {
  return typeof value === "object" && value !== null && "orderId" in value && "entry" in value;
}

function withdrawnOf(content: unknown): readonly unknown[] {
  if (typeof content !== "object" || content === null || !("withdrawn" in content)) {
    return [];
  }
  return Array.isArray(content.withdrawn) ? content.withdrawn : [];
}

function versions() {
  return ctx.prisma.planVersion.findMany({
    where: { serviceDay: SERVICE_DAY },
    orderBy: { version: "asc" },
  });
}

async function currentPlanVersion(): Promise<number | null> {
  const day = await ctx.prisma.productionDay.findUniqueOrThrow({
    where: { serviceDay: SERVICE_DAY },
    select: { planVersion: true },
  });
  return day.planVersion;
}

function entriesOf(content: unknown, ids: Readonly<Record<string, string>>): readonly string[] {
  return shipmentsOf(content)
    .map((shipment) => `${ids[shipment.orderId] ?? shipment.orderId}:${shipment.entry}`)
    .sort();
}

describe("les versions du plan", () => {
  it("arrêt → révision → annulation après l'arrêt → retirage → réouverture → arrêt", async () => {
    await setStage(ctx, "ready");
    const pro = await accountPickup();
    const personal = (await personalPickup(ctx, issued)).id;

    // 1. L'arrêt.
    await closePlan(ctx);
    await ctx.drain();
    expect(await currentPlanVersion()).toBe(1);

    // 2. La révision du pro par l'équipe : une hausse.
    expect((await reviseQuantity(ctx, pro, 5)).status).toBe(200);
    await ctx.drain();
    expect(await currentPlanVersion()).toBe(2);

    // 3. Le particulier annule après l'arrêt : retirée, toujours produite.
    await customerCancel(ctx, personal).expect(204);
    await ctx.drain();
    expect(await currentPlanVersion()).toBe(3);

    // 4. L'équipe reçoit une commande hors plan, puis retire.
    const late = (await placeLateByStaff(ctx, SERVICE_DAY, [{ sku: CROISSANT, quantity: 4 }])).id;
    await retake(ctx);
    await ctx.drain();
    expect(await currentPlanVersion()).toBe(4);

    // 5. La réouverture n'écrit pas de version ; la remise passe au commerce.
    relayGate.open = false;
    await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/reopen`).expect(201);
    expect(await versions()).toHaveLength(4);
    expect(await currentPlanVersion()).toBe(4);
    await releaseRelay(ctx);

    // 6. Le nouvel arrêt.
    await closePlan(ctx);
    await ctx.drain();

    const all = await versions();
    const ids = { [pro]: "pro", [personal]: "personal", [late]: "late" };
    expect(await currentPlanVersion()).toBe(5);
    expect(all.map((version) => [version.version, version.cause, version.printRun])).toEqual([
      [1, "closed", 1],
      [2, "order_revised", 1],
      [3, "order_withdrawn", 1],
      [4, "retaken", 2],
      [5, "closed", 1],
    ]);
    expect(all.map((version) => entriesOf(version.content, ids))).toEqual([
      ["personal:arrested", "pro:arrested"],
      ["personal:unchanged", "pro:unchanged"],
      ["personal:unchanged", "pro:unchanged"],
      ["late:retaken", "personal:unchanged", "pro:unchanged"],
      ["late:arrested_after_reopen", "pro:arrested_after_reopen"],
    ]);

    // Les auteurs : le staff (id), le client par sa seule nature.
    expect(all.map((version) => [version.recordedByKind, version.recordedById])).toEqual([
      ["staff", E2E_STAFF_ID],
      ["staff", E2E_STAFF_ID],
      ["customer", null],
      ["staff", E2E_STAFF_ID],
      ["staff", E2E_STAFF_ID],
    ]);

    // Les arrêts : le premier tient les quatre premières versions, le second la cinquième.
    const [first, , , fourth, fifth] = all;
    expect(fourth?.closedAt).toEqual(first?.closedAt);
    expect(fifth?.closedAt).not.toEqual(first?.closedAt);

    // La retirée reste nommée après le nouvel arrêt qui l'écarte, avec son auteur.
    expect(withdrawnOf(fifth?.content)).toEqual([
      expect.objectContaining({ orderId: personal, rank: 1, by: { kind: "customer" } }),
    ]);
    // La commande hors plan intégrée au retirage le dit.
    expect(
      shipmentsOf(fourth?.content).find((shipment) => shipment.orderId === late)?.offPlan,
    ).toBe(true);
  });

  it("la ré-annonce d'une journée arrêtée n'écrit pas de version", async () => {
    await personalPickup(ctx, issued);
    await closePlan(ctx);
    await ctx.drain();

    await closePlan(ctx);

    expect(await versions()).toHaveLength(1);
    expect(await currentPlanVersion()).toBe(1);
  });
});
