/**
 * **La facture des suites du reste d'une carte** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 6) :
 * l'entité qui facture, complète, et les factures d'une commande.
 */
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { STAFF } from "./production-day-fixture.js";

/** Les factures qui portent la commande. */
export function invoicesOf(ctx: E2eContext, orderId: string) {
  return ctx.prisma.invoice.findMany({ where: { orders: { some: { orderId } } } });
}

const ENTITIES = "/admin/accounting/legal-entities";

/** L'entité qui facture, complète : sans elle, une facture carte ne s'émet pas. */
export async function invoicingEntity(ctx: E2eContext): Promise<void> {
  const staff = ctx.asSub(STAFF);
  const id = jsonBody<{ id: string }>(
    await staff
      .post(ENTITIES)
      .set(INTENT_KEY, freshIntent())
      .send({
        name: "La Folie Douce",
        legalForm: "SAS",
        siren: "552100554",
        rcs: "Chambéry B 552 100 554",
        shareCapitalCents: 1_000_000,
        vatNumber: "FR89552100554",
        address: {
          line1: "12 rue du Fournil",
          line2: "",
          postalCode: "73000",
          city: "Chambéry",
          countryCode: "FR",
        },
      })
      .expect(201),
  ).id;
  await staff
    .put(`${ENTITIES}/${id}/creditor-identifier`)
    .send({ ics: "FR72ZZZ123456" })
    .expect(204);
  await ctx
    .asSub(STAFF)
    .put(`${ENTITIES}/${id}/creditor-account`)
    .send({
      iban: "FR1420041010050500013M02606",
      bic: "BNPAFRPP",
      holder: "La Folie Douce",
      line1: "12 rue du Fournil",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    })
    .expect(204);
  await ctx
    .asSub(STAFF)
    .put(`${ENTITIES}/${id}/invoice-payment-terms`)
    .send({
      latePenaltyRateBasisPoints: 1_415,
      recoveryIndemnityCents: 4_000,
      earlyPaymentDiscount: "néant",
    })
    .expect(204);
  await ctx
    .asSub(STAFF)
    .put(`${ENTITIES}/${id}/invoice-prefix`)
    .send({ prefix: "LFD" })
    .expect(204);
}
