/**
 * E2E des **adresses d'entreprise** — endpoints murés, sur un vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve : les invariants de défaut tenus en transaction
 * (« au plus une livraison par défaut », promotion à l'archivage), l'upsert de
 * l'unique facturation, le tri **défaut d'abord**, le round-trip de la colonne
 * JSON `delivery_specs` (créneaux/contact/GPS), et les trois verdicts du mur
 * (gestionnaire → ok, simple membre → 403 en écriture mais lecture ok,
 * non-membre → 404).
 */
import type { CompanyAddressesView, DeliveryAddressPayload } from "@lfd/contracts";

import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const ADMIN = "auth0|admin";
const MEMBER = "auth0|member";
const STRANGER = "auth0|stranger";

const BILLING = {
  label: "Siège",
  ligne1: "18 rue des Archives",
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "France",
};

/** Une livraison minimale ; les champs de consignes sont surchargés au besoin. */
function delivery(over: Partial<DeliveryAddressPayload> = {}): DeliveryAddressPayload {
  return {
    label: "Boutique",
    ligne1: "9 rue de la Roquette",
    ligne2: "",
    codePostal: "75011",
    ville: "Paris",
    pays: "France",
    isDefault: false,
    specs: {
      signatureRequired: false,
      note: "",
      slots: { mode: "everyday", slot: null },
      deliveryContact: null,
      gps: null,
    },
    ...over,
  };
}

let ctx: E2eContext;
let companyId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const admin = await createUser(ctx.prisma, { auth0Sub: ADMIN });
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await createUser(ctx.prisma, { auth0Sub: STRANGER });
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Marais SAS" });
  companyId = company.id;
  await attachTo(ctx.prisma, admin.id, companyId, CustomerRole.owner);
  await attachTo(ctx.prisma, member.id, companyId, CustomerRole.orders);
});

/** Les adresses de l'entreprise vues par un sub donné. */
async function addressesOf(sub: string): Promise<CompanyAddressesView> {
  const response = await ctx.asSub(sub).get(`/companies/${companyId}/addresses`).expect(200);
  return jsonBody<CompanyAddressesView>(response);
}

describe("le mur des adresses", () => {
  it("un non-membre reçoit 404 (on ne divulgue rien)", async () => {
    await ctx.asSub(STRANGER).get(`/companies/${companyId}/addresses`).expect(404);
    await ctx
      .asSub(STRANGER)
      .post(`/companies/${companyId}/delivery-addresses`)
      .send(delivery())
      .expect(404);
  });

  it("un simple membre lit, mais ne peut pas écrire (403)", async () => {
    await ctx.asSub(MEMBER).get(`/companies/${companyId}/addresses`).expect(200);
    await ctx
      .asSub(MEMBER)
      .post(`/companies/${companyId}/delivery-addresses`)
      .send(delivery())
      .expect(403);
  });
});

describe("facturation — une seule, upsert", () => {
  it("crée puis remplace l'unique adresse de facturation", async () => {
    await ctx
      .asSub(ADMIN)
      .patch(`/companies/${companyId}/billing-address`)
      .send(BILLING)
      .expect(204);
    await ctx
      .asSub(ADMIN)
      .patch(`/companies/${companyId}/billing-address`)
      .send({ ...BILLING, ville: "Lyon" })
      .expect(204);

    const view = await addressesOf(ADMIN);
    expect(view.billing?.ville).toBe("Lyon");
    const count = await ctx.prisma.address.count({ where: { companyId, kind: "facturation" } });
    expect(count).toBe(1);
  });
});

describe("livraison — défaut, tri, archivage", () => {
  it("la première livraison devient le défaut d'office", async () => {
    await ctx
      .asSub(ADMIN)
      .post(`/companies/${companyId}/delivery-addresses`)
      .send(delivery())
      .expect(201);
    const view = await addressesOf(ADMIN);
    expect(view.deliveries).toHaveLength(1);
    expect(view.deliveries[0]?.isDefault).toBe(true);
  });

  it("un nouveau défaut démote l'ancien ; le défaut ressort en tête", async () => {
    await ctx
      .asSub(ADMIN)
      .post(`/companies/${companyId}/delivery-addresses`)
      .send(delivery({ label: "A" }))
      .expect(201);
    await ctx
      .asSub(ADMIN)
      .post(`/companies/${companyId}/delivery-addresses`)
      .send(delivery({ label: "B", isDefault: true }))
      .expect(201);

    const view = await addressesOf(ADMIN);
    expect(view.deliveries).toHaveLength(2);
    expect(view.deliveries[0]?.label).toBe("B");
    expect(view.deliveries[0]?.isDefault).toBe(true);
    expect(view.deliveries.filter((d) => d.isDefault)).toHaveLength(1);
  });

  it("archiver le défaut promeut une autre livraison", async () => {
    const created = await ctx
      .asSub(ADMIN)
      .post(`/companies/${companyId}/delivery-addresses`)
      .send(delivery({ label: "A" }))
      .expect(201);
    await ctx
      .asSub(ADMIN)
      .post(`/companies/${companyId}/delivery-addresses`)
      .send(delivery({ label: "B" }))
      .expect(201);
    const firstId = jsonBody<{ id: string }>(created).id;

    await ctx
      .asSub(ADMIN)
      .delete(`/companies/${companyId}/delivery-addresses/${firstId}`)
      .expect(204);

    const view = await addressesOf(ADMIN);
    expect(view.deliveries).toHaveLength(1);
    expect(view.deliveries[0]?.label).toBe("B");
    expect(view.deliveries[0]?.isDefault).toBe(true);
  });

  it("round-trip des consignes JSON (créneaux par jour, contact, GPS)", async () => {
    const created = await ctx
      .asSub(ADMIN)
      .post(`/companies/${companyId}/delivery-addresses`)
      .send(
        delivery({
          specs: {
            signatureRequired: false,
            note: "Sonner « Boulangerie »",
            slots: {
              mode: "perDay",
              byDay: {
                mon: { start: "06:30", end: "08:00" },
                tue: null,
                wed: null,
                thu: null,
                fri: null,
                sat: { start: "07:30", end: "09:00" },
                sun: null,
              },
            },
            deliveryContact: { prenom: "Camille", nom: "Rousseau", telephone: "0142710844" },
            gps: { lat: 48.8592, lng: 2.3616 },
          },
        }),
      )
      .expect(201);
    const id = jsonBody<{ id: string }>(created).id;

    const view = await addressesOf(ADMIN);
    const stored = view.deliveries.find((d) => d.id === id);
    expect(stored?.specs.note).toBe("Sonner « Boulangerie »");
    expect(stored?.specs.slots).toEqual({
      mode: "perDay",
      byDay: {
        mon: { start: "06:30", end: "08:00" },
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: { start: "07:30", end: "09:00" },
        sun: null,
      },
    });
    expect(stored?.specs.deliveryContact).toEqual({
      prenom: "Camille",
      nom: "Rousseau",
      telephone: "0142710844",
    });
    expect(stored?.specs.gps).toEqual({ lat: 48.8592, lng: 2.3616 });
  });

  it("refuse un créneau à l'envers (validation de contrat à la frontière)", async () => {
    await ctx
      .asSub(ADMIN)
      .post(`/companies/${companyId}/delivery-addresses`)
      .send(
        delivery({
          specs: {
            signatureRequired: false,
            note: "",
            slots: { mode: "everyday", slot: { start: "10:00", end: "08:00" } },
            deliveryContact: null,
            gps: null,
          },
        }),
      )
      .expect(400);
  });

  it("une écriture ne touche pas l'entreprise d'à côté (isolation)", async () => {
    const other = await createCompany(ctx.prisma, { siret: "99999999900017" });
    // Le gestionnaire de `companyId` n'est pas membre de `other`.
    await ctx
      .asSub(ADMIN)
      .post(`/companies/${other.id}/delivery-addresses`)
      .send(delivery())
      .expect(404);
    const leaked = await ctx.prisma.address.count({ where: { companyId: other.id } });
    expect(leaked).toBe(0);
  });
});

describe("préférence d'acheminement (côté client)", () => {
  it("le gestionnaire la pose, et /me la relit", async () => {
    // Elle n'est pas une faveur à demander au staff : c'est le client qui sait
    // où il veut être servi.
    await ctx
      .asSub(ADMIN)
      .patch(`/companies/${companyId}/fulfillment-preference`)
      .send({ method: "pickup" })
      .expect(204);

    const me = jsonBody<{ companies: { fulfillmentPreference: { method: string | null } }[] }>(
      await ctx.asSub(ADMIN).get("/me").expect(200),
    );
    expect(me.companies[0]?.fulfillmentPreference.method).toBe("pickup");
  });

  it("dit « aucune préférence » tant que rien n'a été posé", async () => {
    // `null` n'est pas « retrait » : c'est l'état de tout le portefeuille, et
    // le panier doit continuer de demander.
    const me = jsonBody<{ companies: { fulfillmentPreference: { method: string | null } }[] }>(
      await ctx.asSub(ADMIN).get("/me").expect(200),
    );
    expect(me.companies[0]?.fulfillmentPreference.method).toBeNull();
  });

  it("REFUSE un simple membre (403) et un non-membre (404)", async () => {
    // Le mur du client n'est pas celui du staff : ici c'est le rôle qui tranche.
    await ctx
      .asSub(MEMBER)
      .patch(`/companies/${companyId}/fulfillment-preference`)
      .send({ method: "pickup" })
      .expect(403);
    await ctx
      .asSub(STRANGER)
      .patch(`/companies/${companyId}/fulfillment-preference`)
      .send({ method: "pickup" })
      .expect(404);
  });

  it("REFUSE l'adresse d'une autre société", async () => {
    const other = await createCompany(ctx.prisma, { siret: "" });
    const foreign = await ctx.prisma.address.create({
      data: {
        companyId: other.id,
        kind: "livraison",
        label: "Chez le voisin",
        ligne1: "1 rue Ailleurs",
        codePostal: "75001",
        ville: "Paris",
        pays: "France",
      },
      select: { id: true },
    });

    await ctx
      .asSub(ADMIN)
      .patch(`/companies/${companyId}/fulfillment-preference`)
      .send({ method: "delivery", deliveryAddressId: foreign.id })
      .expect(404);
  });
});

/**
 * Le palier « **étendre** » de la bascule `AddressKind` (`facturation` →
 * `billing`, `livraison` → `delivery`).
 *
 * Ce que ces cas tiennent, et qu'aucun test unitaire ne peut tenir : les
 * lectures passent par de VRAIES clauses SQL (`kind IN (...)`), et trois des
 * cinq lecteurs filtraient sur la **chaîne** `"facturation"` — invisible au
 * gate de langue, qui ne compte que les identifiants. Un filtre oublié ne lève
 * rien : il rend simplement une adresse absente.
 *
 * Le troisième cas est le plus important des trois : il fixe le fait qu'on
 * n'écrit PAS encore le nouvel encodage. C'est la définition du palier — et
 * sans lui, passer aux nouvelles valeurs se ferait par accident au lieu d'être
 * le palier 2.
 */
describe("bascule AddressKind — les deux encodages se lisent pareil", () => {
  it("une facturation écrite `billing` est lue comme LA facturation", async () => {
    await ctx.prisma.address.create({
      data: { companyId, kind: "billing", ...BILLING, isDefault: false },
    });

    const view = await addressesOf(ADMIN);
    expect(view.billing?.ville).toBe("Paris");
  });

  it("une livraison écrite `delivery` entre dans la liste et se laisse archiver", async () => {
    const created = await ctx.prisma.address.create({
      data: {
        companyId,
        kind: "delivery",
        label: "Boutique",
        ligne1: "9 rue de la Roquette",
        ligne2: "",
        codePostal: "75011",
        ville: "Paris",
        pays: "France",
        isDefault: true,
        deliverySpecs: delivery().specs,
      },
      select: { id: true },
    });

    const view = await addressesOf(ADMIN);
    expect(view.deliveries).toHaveLength(1);

    // L'archivage relit la ligne pour la trouver : un filtre resté sur
    // `livraison` seul rendrait 404 ici, pas une liste vide ailleurs.
    await ctx
      .asSub(ADMIN)
      .delete(`/companies/${companyId}/delivery-addresses/${created.id}`)
      .expect(204);
    expect((await addressesOf(ADMIN)).deliveries).toHaveLength(0);
  });

  it("les écritures posent encore l'ANCIEN encodage — le retour arrière reste possible", async () => {
    await ctx
      .asSub(ADMIN)
      .patch(`/companies/${companyId}/billing-address`)
      .send(BILLING)
      .expect(204);
    await ctx
      .asSub(ADMIN)
      .post(`/companies/${companyId}/delivery-addresses`)
      .send(delivery())
      .expect(201);

    const kinds = await ctx.prisma.address.findMany({
      where: { companyId },
      select: { kind: true },
    });
    expect(kinds.map((row) => row.kind).sort()).toEqual(["facturation", "livraison"]);
  });
});
