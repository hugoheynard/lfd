/**
 * E2E des **étiquettes de sac** (2026-10-25, demande de Hugo : « je ne peux
 * pas faire d'étiquette pour les sacs »).
 *
 * Ce qui ne se voit qu'ici : les trois lectures traversent leurs vraies
 * tables — les sacs au colisage, le libellé et le créneau dans l'instantané du
 * fournil, la couleur et le jeton de retrait au commerce — et la route est une
 * lecture, qui ne crée ni n'écrit rien.
 */
import { Buffer } from "node:buffer";

import type { OpenedPackingContainer, PackingBagLabelsView } from "@lfd/contracts";
import type request from "supertest";

import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";

import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  packing,
  place,
} from "./production-day-fixture.js";

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

function base(orderId: string): string {
  return `/admin/packing/${SERVICE_DAY}/orders/${orderId}`;
}

/** Un retrait arrêté au plan, arrivé au poste. */
async function pickupSheet(): Promise<{ readonly orderId: string; readonly reference: string }> {
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
  await closePlan(ctx);
  await settle();
  const sheet = (await packing(ctx)).sheets.find((one) => one.fulfillmentMethod === "pickup");
  if (sheet === undefined) {
    throw new Error("La journée devait porter un retrait.");
  }
  return sheet;
}

async function openBag(orderId: string): Promise<string> {
  const response = await ctx
    .asSub(STAFF)
    .post(`${base(orderId)}/containers`)
    .send({ nature: "bag" })
    .expect(201);
  return jsonBody<OpenedPackingContainer>(response).containerId;
}

async function labelsOf(orderId: string): Promise<PackingBagLabelsView> {
  return jsonBody<PackingBagLabelsView>(
    await ctx
      .asSub(STAFF)
      .get(`${base(orderId)}/bag-labels`)
      .expect(200),
  );
}

describe("les étiquettes des sacs d'une commande", () => {
  it("portent le numéro, le libellé du fournil et « n/N » sur les sacs vivants", async () => {
    const { orderId, reference } = await pickupSheet();
    const voided = await openBag(orderId);
    const second = await openBag(orderId);
    const third = await openBag(orderId);
    await ctx
      .asSub(STAFF)
      .post(`${base(orderId)}/containers/${voided}/void`)
      .expect(204);

    const view = await labelsOf(orderId);

    expect(view).toMatchObject({ orderId, reference });
    expect(view.fulfillmentLabel.startsWith("Retrait")).toBe(true);
    expect(view.when).not.toBe("");
    expect(view.bags).toEqual([
      { containerId: second, label: "Sac 2", rank: 1, of: 2 },
      { containerId: third, label: "Sac 3", rank: 2, of: 2 },
    ]);
  });

  it("le QR est celui du retrait de la commande, jamais un autre", async () => {
    const { orderId } = await pickupSheet();
    await openBag(orderId);
    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { handoverToken: true },
    });

    const { handoverUrl } = await labelsOf(orderId);

    // Vide quand l'origine du back-office n'est pas configurée : pas de QR.
    expect(
      handoverUrl === "" || handoverUrl.endsWith(`/retrait/${order.handoverToken ?? ""}`),
    ).toBe(true);
  });

  it("imprimer n'écrit rien", async () => {
    const { orderId } = await pickupSheet();
    await openBag(orderId);
    const before = await ctx.prisma.packingContainer.count();

    await labelsOf(orderId);

    expect(await ctx.prisma.packingContainer.count()).toBe(before);
  });

  it("une commande absente du poste de ce jour : 404 qui le dit", async () => {
    await pickupSheet();
    const response = await ctx.asSub(STAFF).get(`${base("ord_inconnue")}/bag-labels`);
    expect(response.status).toBe(404);
    expect((response.body as { code?: unknown }).code).toBe("packing.bag_labels.sheet_not_found");
  });
});

/** Le corps brut : supertest ne parse pas un PDF tout seul. */
function pdfOf(test: request.Test): request.Test {
  return test.buffer(true).parse((res, callback) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => {
      callback(null, Buffer.concat(chunks));
    });
  });
}

function pagesOf(response: request.Response): readonly string[] {
  const body: unknown = response.body;
  if (!(body instanceof Uint8Array)) {
    throw new TypeError("le corps servi n'est pas binaire");
  }
  return pdfPages(Buffer.from(body));
}

/** 2026-10-25, Hugo : « imprimer l'étiquette devrait donner un beau PDF ». */
describe("les étiquettes des sacs, en PDF A6", () => {
  it("une feuille par sac vivant, servie en ligne", async () => {
    const { orderId, reference } = await pickupSheet();
    await openBag(orderId);
    await openBag(orderId);

    const response = await pdfOf(ctx.asSub(STAFF).get(`${base(orderId)}/bag-labels.pdf`)).expect(
      200,
    );

    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("inline");
    const pages = pagesOf(response);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain(reference);
    expect(pages[1]).toContain("Sac 2/2");
  });

  it("`?sacs=` n'imprime que ce sac, et imprimer n'écrit rien", async () => {
    const { orderId } = await pickupSheet();
    await openBag(orderId);
    const second = await openBag(orderId);
    const before = await ctx.prisma.packingContainer.count();

    const response = await pdfOf(
      ctx.asSub(STAFF).get(`${base(orderId)}/bag-labels.pdf?sacs=${second}`),
    ).expect(200);

    expect(pagesOf(response)).toHaveLength(1);
    expect(await ctx.prisma.packingContainer.count()).toBe(before);
  });

  it("une commande sans sac : 409 qui le dit, pas une feuille blanche", async () => {
    const { orderId } = await pickupSheet();
    const response = await ctx.asSub(STAFF).get(`${base(orderId)}/bag-labels.pdf`);
    expect(response.status).toBe(409);
    expect((response.body as { code?: unknown }).code).toBe("packing.bag_labels.no_bag");
  });

  it("un sac annulé depuis : 404 qui le dit", async () => {
    const { orderId } = await pickupSheet();
    await openBag(orderId);
    const voided = await openBag(orderId);
    await ctx
      .asSub(STAFF)
      .post(`${base(orderId)}/containers/${voided}/void`)
      .expect(204);

    const response = await ctx.asSub(STAFF).get(`${base(orderId)}/bag-labels.pdf?sacs=${voided}`);
    expect(response.status).toBe(404);
    expect((response.body as { code?: unknown }).code).toBe("packing.bag_labels.bag_not_found");
  });
});
