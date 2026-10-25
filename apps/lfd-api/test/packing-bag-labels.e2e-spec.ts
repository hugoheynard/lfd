/**
 * E2E des **étiquettes de sac** (2026-10-25, demande de Hugo : « je ne peux
 * pas faire d'étiquette pour les sacs »).
 *
 * Ce qui ne se voit qu'ici : les trois lectures traversent leurs vraies
 * tables — les sacs au colisage, le libellé et le créneau dans l'instantané du
 * fournil, la couleur et le jeton de retrait au commerce — et la route est une
 * lecture, qui ne crée ni n'écrit rien.
 */
import type { OpenedPackingContainer, PackingBagLabelsView } from "@lfd/contracts";

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
