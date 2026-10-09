/**
 * La scène des retours bancaires (e2e `collection-returns.e2e-spec.ts`) :
 * une entité émettrice complète, un payeur au compte sous mandat B2B actif
 * avec un bon du mois, et des fiches staff aux droits choisis.
 *
 * ⚠️ Mandat, bon et dérogation de droits écrits par Prisma : même dette que
 * `monthly-invoices.e2e-spec.ts`, faute de chemin public pour les poser.
 */
import { CustomerRole } from "../src/platform/database/client/client.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { addBillingAddress, attachTo, createCompany, createUser } from "./factories.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ENTITIES = "/admin/accounting/legal-entities";
const RIB = {
  iban: "FR7630004000031234567890143",
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};

type Staff = () => ReturnType<E2eContext["asSub"]>;

/** L'entité, complète : ICS, compte, mentions de facture. */
export async function setUpEntity(staff: Staff): Promise<string> {
  const response = await staff()
    .post(ENTITIES)
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
    .expect(201);
  const id = jsonBody<{ id: string }>(response).id;
  await staff()
    .put(`${ENTITIES}/${id}/creditor-identifier`)
    .send({ ics: "FR72ZZZ123456" })
    .expect(204);
  await staff()
    .put(`${ENTITIES}/${id}/creditor-account`)
    .send({ ...RIB, iban: "FR1420041010050500013M02606", holder: "La Folie Douce" })
    .expect(204);
  await staff()
    .put(`${ENTITIES}/${id}/invoice-payment-terms`)
    .send({
      latePenaltyRateBasisPoints: 1_415,
      recoveryIndemnityCents: 4_000,
      earlyPaymentDiscount: "néant",
    })
    .expect(204);
  return id;
}

/** Un payeur au compte : mandat B2B actif, détenteur joignable, un bon avant la clôture. */
export async function invoicedPayer(
  ctx: E2eContext,
  staff: Staff,
  entityId: string,
  closesAt: Date,
  options: { readonly paymentType?: "recurrent" | "one_off" } = {},
): Promise<string> {
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Port" });
  await addBillingAddress(ctx.prisma, company.id);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { vatNumber: "FR40303265045" },
  });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(RIB).expect(204);
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: "RUM-R5-1",
      status: "active",
      acceptedAt: new Date(closesAt.getTime() - 60 * DAY_MS),
      scheme: "B2B",
      paymentType: options.paymentType ?? "recurrent",
    },
  });
  const owner = await createUser(ctx.prisma, { auth0Sub: "r5-owner", email: "patron@port.test" });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  await ctx.prisma.order.create({
    data: {
      orderNumber: "CMD-R5-1",
      companyId: company.id,
      placedByUserId: owner.id,
      subtotalCents: 10_000,
      totalCents: 10_550,
      vatCents: 550,
      paymentStatus: "not_required",
      createdAt: new Date(closesAt.getTime() - 2 * DAY_MS),
      vatShares: [{ rate: 5.5, amountCents: 550 }],
      lines: {
        create: {
          sku: "PAIN-R5",
          productNameSnapshot: "Pain du mois",
          unitPriceMillicents: 10_000_000,
          vatRate: 5.5,
          quantity: 1,
          lineTotalCents: 10_000,
        },
      },
    },
  });
  return company.id;
}

/** Une fiche staff active ; `action` : la dérogation sur `b2b_accounting`, ou aucune. */
export async function readerStaff(
  ctx: E2eContext,
  sub: string,
  action: "read" | null,
): Promise<void> {
  const member = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: sub,
      email: `${sub}@lfc.test`,
      role: "communication",
      status: "active",
      auth0Id: sub,
    },
  });
  if (action !== null) {
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: member.id, resource: "b2b_accounting", action, effect: "allow" },
    });
  }
}
