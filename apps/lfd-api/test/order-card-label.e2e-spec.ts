/**
 * E2E du **libellé définitif d'une passation par carte** (plan
 * `documentation/payment/le-pointage-stripe.md`, § 3) : une fois la
 * commande enregistrée, l'abonné durable de `commerce.order_placed` garde le
 * libellé, et le bloc le pose chez le prestataire après validation — le
 * numéro de commande, qui n'existait pas quand l'intention est née.
 *
 * Seule frontière doublée : le prestataire de carte, qui enregistre chaque
 * libellé posé (`descriptions`). La commande passe par le vrai chemin
 * (`placeOrder`).
 */
import { cardProvidersOverride, e2eCardProviders } from "./card-payments.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";

const BUYER = "auth0|libelle-carte";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [cardProvidersOverride("pi_label")] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

describe("passation par carte — le libellé définitif", () => {
  it("pose le numéro de commande sur l'intention, une fois la commande enregistrée", async () => {
    const { provider } = e2eCardProviders(ctx);
    const descriptionsBefore = provider.descriptions.length;
    const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER, firstName: "Léa" });
    const order = await placeOrder(ctx, {
      buyerUserId: buyer.id,
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    });
    await ctx.drain();

    const { orderNumber } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { orderNumber: true },
    });
    const intent = provider.issued.at(-1);
    const posted = provider.descriptions.slice(descriptionsBefore);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.providerRef).toBe(intent);
    expect(posted[0]?.label.description).toBe(
      `LFD · La Folie Coffee boutique · Commande n° ${orderNumber} · paiement`,
    );
    expect(posted[0]?.label.metadata).toMatchObject({ order_number: orderNumber });
  });
});
