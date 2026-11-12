import { jsonBody, serviceDay, type E2eContext } from "../e2e-harness.js";
import { createUser } from "../factories.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import { handOver, payByCard, placeOrder } from "../order-factory.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";
import { pickupPoint, png } from "./seeds.js";

const HTTP = "lafoliecoffee/contact/http";
const CLIENT = "replay-client";

const REASON = {
  kind: "contact",
  label: { fr: "Une question sur ma commande", en: "About my order", it: "" },
  recipientEmail: "commandes@lfc.test",
  position: 0,
  active: true,
  audience: "both",
  priority: "medium",
};

/** Un objet de demande, posé par la route. */
async function reason(ctx: E2eContext, kind: "contact" | "order_problem"): Promise<string> {
  const response = await ctx
    .asSub(STAFF)
    .post("/admin/request-reasons")
    .set(INTENT_KEY, freshIntent())
    .send({ ...REASON, kind })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

const message = (reasonId: string): object => ({
  reasonId,
  name: "Jean Martin",
  email: "jean@visiteur.test",
  phone: "",
  message: "Bonjour, ma commande est-elle prête ?",
  lfd_trap: "",
});

/** Les demandes : objets, numéros, messages, signalements. */
export const CONTACT_SCENARIOS: ScenarioSet = {
  [routeKey(`${HTTP}/admin-request-reasons.controller.ts`, "create")]: () =>
    Promise.resolve({ sub: STAFF, path: "/admin/request-reasons", body: REASON }),

  [routeKey(`${HTTP}/admin-contact-phones.controller.ts`, "create")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/contact/phones",
      body: {
        label: { fr: "Boutique de Val d'Isère", en: "", it: "" },
        audience: "b2c",
        number: "04 79 00 00 00",
        position: 1,
        active: true,
      },
    }),

  [routeKey(`${HTTP}/contact-messages.controller.ts`, "send")]: async ({ ctx }) => ({
    sub: null,
    path: "/contact-messages",
    body: message(await reason(ctx, "contact")),
  }),

  [routeKey(`${HTTP}/my-contact-messages.controller.ts`, "send")]: async ({ ctx }) => {
    await createUser(ctx.prisma, { auth0Sub: CLIENT });
    return {
      sub: CLIENT,
      path: "/me/contact-messages",
      body: message(await reason(ctx, "contact")),
    };
  },

  [routeKey(`${HTTP}/my-order-problems.controller.ts`, "report")]: async ({ ctx }) => {
    const user = await createUser(ctx.prisma, { auth0Sub: CLIENT });
    const reasonId = await reason(ctx, "order_problem");
    const order = await placeOrder(ctx, {
      buyerUserId: user.id,
      forDay: serviceDay(),
      fulfillment: { method: "pickup", pickupSiteId: await pickupPoint(ctx) },
    });
    await payByCard(ctx, order);
    await handOver(ctx, order);
    return {
      sub: CLIENT,
      path: `/me/orders/${order.id}/problems`,
      fields: { reasonId, message: "Le pain était écrasé." },
      files: [
        { field: "photos", content: png(40, 30), filename: "p0.png", contentType: "image/png" },
      ],
    };
  },
};
