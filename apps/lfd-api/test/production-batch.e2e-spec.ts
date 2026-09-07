import { randomUUID } from "node:crypto";
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

import { CustomerRole } from "../src/platform/database/client/client.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const MEMBER = "auth0|member";
const SERVICE_DAY = serviceDay();

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
      kind: "delivery",
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
        idempotencyKey: randomUUID(),
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
    expect(sheet?.fulfillment.contact).toEqual({
      source: "order",
      name: "Camille Rousseau",
      phone: "0142710844",
    });
    // La signature aussi est figée : elle vaut pour ce qui part, pas pour le
    // réglage d'aujourd'hui.
    expect(sheet?.fulfillment.signatureRequired).toBe(true);
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
        idempotencyKey: randomUUID(),
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
    expect(sheet?.fulfillment.contact).toBeNull();
    // Et elle porte son heure d'arrêt : sans elle, deux tirages du même jour
    // circulent au fournil sans qu'on puisse les distinguer.
    expect(sheet?.issuedAt).toBe(sheet?.placedAt);
    expect(sheet?.revision).toBe(0);
    expect(sheet?.fulfillment.signatureRequired).toBe(false);
  });
});

/**
 * Le **colisage** : le scan qui déclare une commande prête.
 *
 * Deux choses ne se prouvent qu'ici. La **course** — deux postes qui scannent la
 * même feuille au même moment ne doivent produire qu'un seul fait, et c'est la
 * base qui arbitre. Et le fait que la lecture se fasse par le **numéro**, qui
 * est imprimé en clair : rien à protéger, mais rien à deviner non plus.
 */
describe("le colisage", () => {
  /** Passe une commande personnelle et rend son numéro. */
  async function placeOne(): Promise<string> {
    await createUser(ctx.prisma, { auth0Sub: MEMBER });
    await ctx.prisma.deliveryZone.create({
      data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
    });
    const response = await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        companyId: null,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "delivery",
        deliveryAddress: SITE,
        note: "",
        lines: [{ sku: "VIE-001", quantity: 2 }],
      })
      .expect(201);
    return jsonBody<{ orderNumber: string }>(response).orderNumber;
  }

  it("déclare une commande prête, et grave QUI l'a fait", async () => {
    const reference = await placeOne();

    const view = jsonBody<{
      readyAt: string | null;
      readyBy: string | null;
      blockedReason: string | null;
    }>(
      await ctx.asSub("staff-e2e").post(`/admin/production/packing/${reference}/ready`).expect(201),
    );

    expect(view.readyAt).not.toBeNull();
    // L'auteur ne vient JAMAIS de la charge utile : il vient de la session.
    expect(view.readyBy).toBe("staff-e2e");
    // La réponse porte DÉJÀ le refus du scan suivant : l'accusé de réception est
    // pris sur l'état d'après, pas sur celui d'avant. Le fournil apprend donc du
    // même coup que c'est fait et qu'un second passage ne servira à rien.
    expect(view.blockedReason).toBe("Cette commande est déjà déclarée prête.");
  });

  it("fait avancer le statut, ce que rien ne faisait entre `placed` et la remise", async () => {
    const reference = await placeOne();
    await ctx.asSub("staff-e2e").post(`/admin/production/packing/${reference}/ready`).expect(201);

    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { orderNumber: reference },
      select: { status: true, readyBy: true },
    });
    expect(row.status).toBe("ready");
    expect(row.readyBy).toBe("staff-e2e");
  });

  it("REFUSE le second scan, et dit pourquoi", async () => {
    // Deux mains sur la même commande est le cas normal au fournil, pas une
    // anomalie : le refus doit nommer le cas, pas jeter une erreur technique.
    const reference = await placeOne();
    await ctx.asSub("staff-e2e").post(`/admin/production/packing/${reference}/ready`).expect(201);

    const refused = await ctx
      .asSub("staff-e2e")
      .post(`/admin/production/packing/${reference}/ready`)
      .expect(409);
    expect(jsonBody<{ message: string }>(refused).message).toContain("déjà déclarée prête");
  });

  it("ne produit QU'UN colisage quand deux postes scannent en même temps", async () => {
    // La course, la seule chose que le vrai SQL prouve : le `where readyAt: null`
    // fait arbitrer la base, pas l'ordre d'arrivée des requêtes.
    const reference = await placeOne();

    const results = await Promise.all([
      ctx.asSub("staff-e2e").post(`/admin/production/packing/${reference}/ready`),
      ctx.asSub("staff-e2e").post(`/admin/production/packing/${reference}/ready`),
    ]);

    expect(results.filter((response) => response.status === 201)).toHaveLength(1);
    expect(results.filter((response) => response.status === 409)).toHaveLength(1);
  });

  it("lit la commande derrière le code AVANT de déclarer quoi que ce soit", async () => {
    const reference = await placeOne();

    const view = jsonBody<{ reference: string; totalUnits: number; blockedReason: null }>(
      await ctx.asSub("staff-e2e").get(`/admin/production/packing/${reference}`).expect(200),
    );

    expect(view.reference).toBe(reference);
    expect(view.totalUnits).toBe(2);
    expect(view.blockedReason).toBeNull();
  });

  it("répond 404 sur une feuille d'un autre jour, en nommant la cause probable", async () => {
    const refused = await ctx
      .asSub("staff-e2e")
      .get(`/admin/production/packing/ORD-INEXISTANTE`)
      .expect(404);

    expect(jsonBody<{ message: string }>(refused).message).toContain("autre jour");
  });
});
