import { randomUUID } from "node:crypto";
/**
 * E2E du **poste de colisage** — les bacs d'un côté, la ressource de l'autre.
 *
 * Trois choses ne se prouvent qu'ici, contre du vrai SQL :
 *
 * - **la balance**, qui somme les lignes cochées de TOUS les bacs : elle se
 *   calcule sur l'état relu, donc une colonne mal rehydratée ne se voit qu'ici ;
 * - **la réversibilité**, qui suppose deux écritures successives sur la même
 *   ligne et une relecture entre les deux ;
 * - **le refus sur bac fermé**, où la fermeture passe par une AUTRE route (celle
 *   des QR imprimés) et n'existe donc, du point de vue du poste, que dans la
 *   base ;
 * - **le lien avec la fiche d'atelier** : une ligne dont l'article n'est pas
 *   sorti du four n'entre pas dans un bac, et c'est une coche posée sur l'AUTRE
 *   écran qui la débloque. Les deux surfaces lisent le même agrégat, et rien
 *   d'autre que la base ne le prouve.
 */
import type { ProductionPackingView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

const MEMBER = "auth0|member";
const STAFF = "staff-e2e";
const SERVICE_DAY = serviceDay();

/** Le croissant du catalogue de test — `VIE-001`, « Croissant ». */
const CROISSANT = "VIE-001";
/** La baguette — le second article, celui qui reste au bon sans être coché. */
const BAGUETTE = "PAI-001";

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Signature du jeton staff doublée : le reste du mur admin est réel. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: STAFF, scopes: [] }),
};

let intentCount = 0;
const fakeGateway = {
  createIntent: () => {
    intentCount += 1;
    const id = `pi_e2e_${String(intentCount)}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

/** Passe une commande de retrait pour la journée servie. */
async function place(lines: readonly { sku: string; quantity: number }[]): Promise<void> {
  const point = await ctx.prisma.pickupAddress.findFirst({ select: { id: true } });
  const id =
    point?.id ?? (await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } })).id;
  await ctx
    .asSub(MEMBER)
    .post(`/orders`)
    .send({
      idempotencyKey: randomUUID(),
      companyId: null,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      pickupAddressId: id,
      note: "",
      lines,
    })
    .expect(201);
}

async function closePlan(): Promise<void> {
  await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/close`).expect(201);
}

/**
 * Coche la ligne sur la **fiche d'atelier** — « c'est sorti du four ».
 *
 * Sans elle, le poste refuse de mettre l'article au bac : la balance compterait
 * comme réparti ce qui n'a jamais été fabriqué.
 */
async function produce(sku: string): Promise<void> {
  await ctx
    .asSub(STAFF)
    .put(`/admin/production/worksheet/${SERVICE_DAY}/lines/${sku}/done`)
    .send({ initials: "KA" })
    .expect(204);
}

async function packing(): Promise<ProductionPackingView> {
  return jsonBody<ProductionPackingView>(
    await ctx.asSub(STAFF).get(`/admin/production/packing?date=${SERVICE_DAY}`).expect(200),
  );
}

async function mark(
  reference: string,
  sku: string,
  initials = "MB",
  expected = 204,
): Promise<void> {
  await ctx
    .asSub(STAFF)
    .put(`/admin/production/packing/${SERVICE_DAY}/sheets/${reference}/lines/${sku}`)
    .send({ initials })
    .expect(expected);
}

async function unmark(reference: string, sku: string, expected = 204): Promise<void> {
  await ctx
    .asSub(STAFF)
    .delete(`/admin/production/packing/${SERVICE_DAY}/sheets/${reference}/lines/${sku}`)
    .expect(expected);
}

/** Le premier bac de la journée — une lecture qui n'en porte aucun est le bug. */
function firstSheet(view: ProductionPackingView): ProductionPackingView["sheets"][number] {
  const sheet = view.sheets[0];
  if (sheet === undefined) {
    throw new Error(`Le poste du ${view.date} ne porte aucun bac.`);
  }
  return sheet;
}

/** La ressource d'un SKU, ou l'échec — une balance qui l'ignore est le bug. */
function resourceOf(
  view: ProductionPackingView,
  sku: string,
): ProductionPackingView["resources"][number] {
  const resource = view.resources.find((candidate) => candidate.sku === sku);
  if (resource === undefined) {
    throw new Error(`La balance du ${view.date} ne porte aucun article « ${sku} ».`);
  }
  return resource;
}

describe("une journée qui n'est pas arrêtée", () => {
  it("rend le vide, et ne refuse pas la lecture", async () => {
    await place([{ sku: CROISSANT, quantity: 12 }]);

    const view = await packing();

    expect(view).toEqual({ date: SERVICE_DAY, closedAt: null, sheets: [], resources: [] });
  });

  it("refuse de cocher : sans plan arrêté, il n'y a pas de bon à remplir", async () => {
    await place([{ sku: CROISSANT, quantity: 12 }]);

    await mark("CMD-0001", CROISSANT, "MB", 409);
  });
});

describe("le remplissage d'un bac", () => {
  it("coche une ligne, et la balance BOUGE", async () => {
    await place([
      { sku: CROISSANT, quantity: 12 },
      { sku: BAGUETTE, quantity: 30 },
    ]);
    await closePlan();
    await produce(CROISSANT);

    const before = await packing();
    expect(before.closedAt).not.toBeNull();
    expect(before.sheets).toHaveLength(1);
    expect(before.resources).toHaveLength(2);
    const sheet = firstSheet(before);
    expect(sheet.lines).toHaveLength(2);
    expect(resourceOf(before, CROISSANT)).toMatchObject({
      produced: 12,
      allocated: 0,
      remaining: 12,
    });

    await mark(sheet.reference, CROISSANT);

    const after = await packing();
    expect(after.sheets).toHaveLength(1);
    const line = firstSheet(after).lines.find((candidate) => candidate.sku === CROISSANT);
    expect(line).toMatchObject({ packed: true, initials: "MB" });
    expect(line?.packedAt).not.toBeNull();
    expect(resourceOf(after, CROISSANT)).toMatchObject({
      produced: 12,
      allocated: 12,
      remaining: 0,
    });
    // La baguette, elle, n'a pas bougé : cocher une ligne ne dit rien des autres.
    expect(resourceOf(after, BAGUETTE)).toMatchObject({ allocated: 0, remaining: 30 });
  });

  it("décoche — un doigt fariné n'est pas un incident", async () => {
    await place([{ sku: CROISSANT, quantity: 12 }]);
    await closePlan();
    await produce(CROISSANT);
    const reference = firstSheet(await packing()).reference;
    await mark(reference, CROISSANT);

    await unmark(reference, CROISSANT);

    const view = await packing();
    expect(view.sheets).toHaveLength(1);
    expect(firstSheet(view).lines).toHaveLength(1);
    expect(firstSheet(view).lines[0]).toMatchObject({
      packed: false,
      initials: null,
      packedAt: null,
    });
    expect(resourceOf(view, CROISSANT)).toMatchObject({ allocated: 0, remaining: 12 });
  });

  it("somme les bacs de TOUS les clients, et le reste peut passer sous zéro", async () => {
    // Le cas que le fournil doit voir tôt : les bons demandent plus que le
    // tirage n'a prévu. Ici le second bon arrive APRÈS la clôture, donc le
    // compte à produire n'en sait rien — et c'est exactement la situation qui
    // creuse l'écart.
    await place([{ sku: CROISSANT, quantity: 12 }]);
    await closePlan();
    await produce(CROISSANT);
    const first = firstSheet(await packing()).reference;
    await mark(first, CROISSANT);
    await place([{ sku: CROISSANT, quantity: 20 }]);
    await ctx.asSub(STAFF).post(`/admin/production/worksheet/${SERVICE_DAY}/retake`).expect(201);

    const view = await packing();
    expect(view.sheets).toHaveLength(2);
    // Le retirage réécrit la journée entière : la ligne déjà rangée survit.
    const kept = view.sheets.find((sheet) => sheet.reference === first);
    expect(kept?.lines[0]).toMatchObject({ packed: true, initials: "MB" });

    const second = view.sheets.find((sheet) => sheet.reference !== first);
    expect(second).toBeDefined();
    await mark(second?.reference ?? "", CROISSANT);

    const balanced = await packing();
    expect(resourceOf(balanced, CROISSANT)).toMatchObject({
      produced: 32,
      allocated: 32,
      remaining: 0,
    });
  });
});

describe("le bac FERMÉ", () => {
  it("🔴 refuse de cocher et de décocher — le contenu a été annoncé", async () => {
    await place([{ sku: CROISSANT, quantity: 12 }]);
    await closePlan();
    await produce(CROISSANT);
    const reference = firstSheet(await packing()).reference;
    await mark(reference, CROISSANT);

    await ctx
      .asSub(STAFF)
      .post(`/admin/production/batch/${SERVICE_DAY}/sheets/${reference}/packed`)
      .expect(201);

    await mark(reference, CROISSANT, "LM", 409);
    await unmark(reference, CROISSANT, 409);

    const view = await packing();
    expect(view.sheets).toHaveLength(1);
    expect(firstSheet(view).packedAt).not.toBeNull();
    // Les initiales du premier geste tiennent : le second n'a rien réécrit.
    expect(firstSheet(view).lines[0]).toMatchObject({ packed: true, initials: "MB" });
  });
});

describe("l'article pas encore sorti du four", () => {
  it("🔴 refuse le bac tant que la fiche d'atelier n'est pas cochée, et l'accepte après", async () => {
    // Les deux écrans lisent le même agrégat : c'est une coche posée sur la
    // FICHE qui débloque le bac. Rien d'autre que la base ne le prouve.
    await place([{ sku: CROISSANT, quantity: 12 }]);
    await closePlan();
    const reference = firstSheet(await packing()).reference;

    const before = await packing();
    expect(before.sheets).toHaveLength(1);
    expect(firstSheet(before).lines).toHaveLength(1);
    expect(firstSheet(before).lines[0]?.awaitingProduction).toBe(true);
    expect(resourceOf(before, CROISSANT).awaitingProduction).toBe(true);
    await mark(reference, CROISSANT, "MB", 409);

    await produce(CROISSANT);

    const after = await packing();
    expect(firstSheet(after).lines[0]?.awaitingProduction).toBe(false);
    expect(resourceOf(after, CROISSANT).awaitingProduction).toBe(false);
    await mark(reference, CROISSANT);
    expect(resourceOf(await packing(), CROISSANT).allocated).toBe(12);
  });

  it("laisse RESSORTIR du bac une ligne dont la coche d'atelier a été reprise", async () => {
    // Refuser les deux sens enfermerait l'exploitant avec un bac qu'il ne peut
    // ni compléter ni corriger.
    await place([{ sku: CROISSANT, quantity: 12 }]);
    await closePlan();
    await produce(CROISSANT);
    const reference = firstSheet(await packing()).reference;
    await mark(reference, CROISSANT);

    await ctx
      .asSub(STAFF)
      .delete(`/admin/production/worksheet/${SERVICE_DAY}/lines/${CROISSANT}/done`)
      .expect(204);

    const view = await packing();
    expect(firstSheet(view).lines[0]).toMatchObject({ packed: true, awaitingProduction: true });
    await unmark(reference, CROISSANT);
    expect(resourceOf(await packing(), CROISSANT).allocated).toBe(0);
  });
});

describe("les containers de la commande", () => {
  async function setContainers(
    reference: string,
    containers: number,
    expected = 204,
  ): Promise<void> {
    await ctx
      .asSub(STAFF)
      .put(`/admin/production/packing/${SERVICE_DAY}/sheets/${reference}/containers`)
      .send({ containers })
      .expect(expected);
  }

  it("pose un compte de bacs, et le relit", async () => {
    await place([{ sku: CROISSANT, quantity: 12 }]);
    await closePlan();
    const reference = firstSheet(await packing()).reference;
    expect(firstSheet(await packing()).containers).toBe(0);

    await setContainers(reference, 3);

    const view = await packing();
    expect(view.sheets).toHaveLength(1);
    expect(firstSheet(view).containers).toBe(3);
  });

  it("🔴 la fermeture du bac FIGE le compte", async () => {
    await place([{ sku: CROISSANT, quantity: 12 }]);
    await closePlan();
    const reference = firstSheet(await packing()).reference;
    await setContainers(reference, 2);

    await ctx
      .asSub(STAFF)
      .post(`/admin/production/batch/${SERVICE_DAY}/sheets/${reference}/packed`)
      .expect(201);

    await setContainers(reference, 5, 409);
    expect(firstSheet(await packing()).containers).toBe(2);
  });

  it("refuse ce qui n'est pas un nombre de bacs recevable", async () => {
    await place([{ sku: CROISSANT, quantity: 12 }]);
    await closePlan();
    const reference = firstSheet(await packing()).reference;

    await setContainers(reference, -1, 400);
    await setContainers(reference, 2.5, 400);
    await setContainers(reference, 100, 400);
    expect(firstSheet(await packing()).containers).toBe(0);
  });
});

describe("les refus de forme", () => {
  it("refuse une référence hors du plan du jour", async () => {
    await place([{ sku: CROISSANT, quantity: 12 }]);
    await closePlan();

    await mark("CMD-9999", CROISSANT, "MB", 404);
  });

  it("refuse un SKU qui n'est pas sur ce bon", async () => {
    await place([{ sku: CROISSANT, quantity: 12 }]);
    await closePlan();
    const reference = firstSheet(await packing()).reference;

    await mark(reference, BAGUETTE, "MB", 404);
  });

  it("refuse une date qui n'en est pas une, et des initiales trop longues", async () => {
    await ctx.asSub(STAFF).get(`/admin/production/packing?date=08/09/2026`).expect(400);

    await place([{ sku: CROISSANT, quantity: 12 }]);
    await closePlan();
    await produce(CROISSANT);
    const reference = firstSheet(await packing()).reference;
    await mark(reference, CROISSANT, "TROPLONG", 400);
  });
});
