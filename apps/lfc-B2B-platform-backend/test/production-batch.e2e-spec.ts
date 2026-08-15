/**
 * E2E du **lot de production** — ce que le labo imprime pour une journée.
 *
 * Une seule chose se prouve ici, et elle ne se prouve qu'avec du vrai SQL : une
 * fiche dit ce qui a été **convenu à la passation**, et rien d'autre. Le
 * carnet d'adresses peut bouger après coup — il bougera — sans qu'un bon déjà
 * parti en tournée se mette à dire autre chose que le papier.
 *
 * C'est un test de non-régression, pas de fonctionnalité : le code lisait le
 * carnet, et personne ne l'aurait vu avant qu'un client change son contact
 * entre la commande et la livraison.
 */
import type { ProductionBatchView } from "@lfd/contracts";

import { CustomerRole } from "../src/infra/database/client/client.js";
import { AdminTokenVerifier } from "../src/infra/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const MEMBER = "auth0|member";
const SERVICE_DAY = "2026-09-01";

/** Le contact que la société a renseigné sur son adresse, AVANT de commander. */
const CONTACT_DU_JOUR = { prenom: "Camille", nom: "Rousseau", telephone: "0142710844" };
/** Celui qu'elle mettra APRÈS — la fiche ne doit jamais le voir. */
const CONTACT_D_APRES = { prenom: "Yanis", nom: "Delorme", telephone: "0600000000" };

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
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_e2e", clientSecret: "pi_e2e_secret" }),
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
});

/** Sème une société active, son membre, sa zone, et son adresse de carnet. */
async function seedSociete(): Promise<{ companyId: string; addressId: string }> {
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma, { status: "active" });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
  const address = await ctx.prisma.address.create({
    data: {
      ...SITE,
      companyId: company.id,
      kind: "livraison",
      isDefault: true,
      deliverySpecs: {
        note: "",
        slots: { mode: "everyday", slot: null },
        deliveryContact: CONTACT_DU_JOUR,
        gps: null,
        signatureRequired: true,
      },
    },
    select: { id: true },
  });
  return { companyId: company.id, addressId: address.id };
}

async function batch(): Promise<ProductionBatchView> {
  const response = await ctx
    .asSub("staff-e2e")
    .get(`/admin/production/batch?date=${SERVICE_DAY}`)
    .expect(200);
  return jsonBody<ProductionBatchView>(response);
}

describe("la fiche de production lit ce qui a été convenu", () => {
  it("garde le contact de la commande même quand le carnet change APRÈS", async () => {
    const { companyId, addressId } = await seedSociete();

    await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        companyId,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "delivery",
        deliveryAddress: SITE,
        deliveryAddressId: addressId,
        note: "",
        lines: [{ sku: "VIE-001", quantity: 2 }],
      })
      .expect(201);

    // Le client change son contact sur place — après avoir commandé.
    await ctx.prisma.address.update({
      where: { id: addressId },
      data: {
        deliverySpecs: {
          note: "",
          slots: { mode: "everyday", slot: null },
          deliveryContact: CONTACT_D_APRES,
          gps: null,
          signatureRequired: false,
        },
      },
    });

    const sheet = (await batch()).sheets[0];
    expect(sheet?.deliveryContact).toEqual({
      source: "order",
      name: "Camille Rousseau",
      phone: "0142710844",
    });
    // La signature aussi est figée : elle vaut pour ce qui part, pas pour le
    // réglage d'aujourd'hui.
    expect(sheet?.signatureRequired).toBe(true);
  });

  it("écrit « aucun contact » plutôt que d'aller en chercher un ailleurs", async () => {
    // Adresse dictée à la volée : rien de convenu, et la société n'a pas de
    // détenteur nommé. Le livreur doit le savoir avant de sonner.
    await createUser(ctx.prisma, { auth0Sub: MEMBER });
    await ctx.prisma.deliveryZone.create({
      data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
    });

    await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        companyId: null,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "delivery",
        deliveryAddress: SITE,
        note: "",
        lines: [{ sku: "VIE-001", quantity: 2 }],
      })
      .expect(201);

    const sheet = (await batch()).sheets[0];
    // Commande personnelle : pas de société, donc pas de détenteur à qui se
    // rabattre. La fiche le dit au lieu de laisser un blanc.
    expect(sheet?.deliveryContact).toBeNull();
    expect(sheet?.signatureRequired).toBe(false);
  });
});
