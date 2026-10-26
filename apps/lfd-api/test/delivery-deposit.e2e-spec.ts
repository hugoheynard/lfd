/**
 * E2E du **« dépôt autorisé »** sur une adresse de livraison
 * (`documentation/livraisons/livreur/a-la-porte.md`, AP-Q1, AP-D5) — une colonne
 * du carnet, réglée par le client sur sa route d'édition. La route à part du
 * staff a été retirée le 2026-10-26 (décision de Hugo) : la règle du dépôt ne
 * lit plus ce réglage.
 *
 * 🔴 Ce que seul le vrai SQL prouve : une édition du client qui ne l'envoie
 * pas — un front en ligne qui ne le connaît pas — ne le remet pas à `false`,
 * et l'édition staff de l'adresse (sous `b2b_companies`) ne le touche pas.
 */
import type { CompanyAddressesView, DeliveryAddressPayload } from "@lfd/contracts";

import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { admin, ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const OWNER = "auth0|owner";

const ADDRESS: DeliveryAddressPayload = {
  label: "Boutique",
  ligne1: "9 rue de la Roquette",
  ligne2: "",
  codePostal: "75011",
  ville: "Paris",
  pays: "France",
  isDefault: true,
  specs: {
    signatureRequired: false,
    note: "",
    slotList: { mode: "everyday", slots: [] },
    deliveryContact: null,
    gps: null,
  },
};

let ctx: E2eContext;
let companyId: string;
let addressId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
  companyId = (await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Marais SAS" })).id;
  await attachTo(ctx.prisma, owner.id, companyId, CustomerRole.owner);
  const created = await ctx
    .asSub(OWNER)
    .post(`/companies/${companyId}/delivery-addresses`)
    .send(ADDRESS)
    .expect(201);
  addressId = jsonBody<{ id: string }>(created).id;
});

async function depositOf(): Promise<boolean | undefined> {
  const view = jsonBody<CompanyAddressesView>(
    await ctx.asSub(OWNER).get(`/companies/${companyId}/addresses`).expect(200),
  );
  return view.deliveries.find((address) => address.id === addressId)?.depositAllowed;
}

const CLIENT_EDIT = (): string => `/companies/${companyId}/delivery-addresses/${addressId}`;
const STAFF_DEPOSIT = (): string =>
  `/admin/companies/${companyId}/delivery-addresses/${addressId}/deposit`;

describe("« dépôt autorisé » (AP-D5)", () => {
  it("une adresse neuve n'autorise rien", async () => {
    expect(await depositOf()).toBe(false);
  });

  it("🔴 le client l'autorise ; une édition qui ne l'envoie pas le garde", async () => {
    await ctx
      .asSub(OWNER)
      .patch(CLIENT_EDIT())
      .send({ ...ADDRESS, depositAllowed: true })
      .expect(204);
    expect(await depositOf()).toBe(true);

    await ctx
      .asSub(OWNER)
      .patch(CLIENT_EDIT())
      .send({ ...ADDRESS, label: "Boutique (cour)" })
      .expect(204);

    expect(await depositOf()).toBe(true);
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "company.delivery_deposit_set" } }),
    ).toBe(1);
  });

  it("le staff n'a plus de route pour le régler (retirée le 2026-10-26) ; son édition d'adresse ne le touche pas", async () => {
    await admin(ctx).put(STAFF_DEPOSIT()).send({ depositAllowed: true }).expect(404);
    expect(await depositOf()).toBe(false);

    await ctx
      .asSub(OWNER)
      .patch(CLIENT_EDIT())
      .send({ ...ADDRESS, depositAllowed: true })
      .expect(204);
    await admin(ctx)
      .patch(`/admin/companies/${companyId}/delivery-addresses/${addressId}`)
      .send({ ...ADDRESS, depositAllowed: false })
      .expect(204);

    expect(await depositOf()).toBe(true);
  });
});
