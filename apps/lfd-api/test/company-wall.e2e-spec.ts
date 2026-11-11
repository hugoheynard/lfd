/**
 * E2E du **mur** des écritures d'une société par ses clients — sur un vrai
 * Postgres.
 *
 * Chaque route d'écriture de la fiche, des adresses et des contacts, éprouvée
 * contre les trois appelants qui ne doivent rien y écrire :
 *
 * - le gestionnaire d'une AUTRE société, qui forge l'URL → 404 (on ne
 *   divulgue pas qu'elle existe) ;
 * - un simple membre de la société → 403 ;
 * - le gestionnaire d'une autre société qui vise, sous SA société, l'adresse
 *   ou le contact de la première → refusé, rien d'écrit.
 *
 * Et dans tous les cas, la fiche relue en base est intacte.
 */
import type { DeliveryAddressPayload } from "@lfd/contracts";

import { AddressKind, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const OWNER = "auth0|owner";
const MEMBER = "auth0|member";
const OTHER_OWNER = "auth0|other-owner";

const BILLING = {
  label: "Siège",
  ligne1: "18 rue des Archives",
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "France",
};

const CONTACT = {
  firstName: "Karim",
  lastName: "Benali",
  fonction: "Responsable achats",
  email: "achats@pqmarais.fr",
  phone: "06 12 88 54 30",
  role: "orders",
};

function delivery(label: string): DeliveryAddressPayload {
  return {
    label,
    ligne1: "9 rue de la Roquette",
    ligne2: "",
    codePostal: "75011",
    ville: "Paris",
    pays: "France",
    isDefault: false,
    specs: {
      signatureRequired: false,
      note: "",
      slotList: { mode: "everyday", slots: [] },
      deliveryContact: null,
      gps: null,
    },
  };
}

let ctx: E2eContext;
let companyId: string;
let otherCompanyId: string;
let addressId: string;
let contactId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const otherOwner = await createUser(ctx.prisma, { auth0Sub: OTHER_OWNER });
  companyId = (await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Marais SAS" })).id;
  otherCompanyId = (await createCompany(ctx.prisma, { raisonSociale: "Torréfaction B SARL" })).id;
  await attachTo(ctx.prisma, owner.id, companyId, CustomerRole.owner);
  await attachTo(ctx.prisma, member.id, companyId, CustomerRole.orders);
  await attachTo(ctx.prisma, otherOwner.id, otherCompanyId, CustomerRole.owner);

  const owned = ctx.asSub(OWNER);
  await owned.patch(`/companies/${companyId}/billing-address`).send(BILLING).expect(204);
  addressId = jsonBody<{ id: string }>(
    await owned
      .post(`/companies/${companyId}/delivery-addresses`)
      .send(delivery("Boutique"))
      .expect(201),
  ).id;
  contactId = jsonBody<{ id: string }>(
    await owned.post(`/companies/${companyId}/contacts`).send(CONTACT).expect(201),
  ).id;
});

/** Ce qu'un refus ne doit pas avoir touché : la fiche, ses adresses, ses contacts. */
async function snapshot(): Promise<unknown> {
  const [company, addresses, contacts] = await Promise.all([
    ctx.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: {
        enseigne: true,
        vatNumber: true,
        requestedTerm: true,
        contactPrenom: true,
        contactNom: true,
        contactEmail: true,
      },
    }),
    ctx.prisma.address.findMany({
      where: { companyId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        kind: true,
        label: true,
        ligne1: true,
        isDefault: true,
        archivedAt: true,
      },
    }),
    ctx.prisma.companyContact.findMany({
      where: { companyId },
      orderBy: { id: "asc" },
      select: { id: true, nom: true, email: true },
    }),
  ]);
  return { company, addresses, contacts };
}

/** Une écriture d'une route, envoyée par `sub` sur la société `target`. */
interface Write {
  readonly name: string;
  readonly send: (sub: string, target: string) => Promise<{ status: number }>;
}

const WRITES: readonly Write[] = [
  {
    name: "PATCH identity",
    send: (sub, target) =>
      ctx
        .asSub(sub)
        .patch(`/companies/${target}/identity`)
        .send({ enseigne: "Forgée", vatNumber: "" }),
  },
  {
    name: "PATCH payment-term",
    send: (sub, target) =>
      ctx.asSub(sub).patch(`/companies/${target}/payment-term`).send({ paymentTerm: "monthly" }),
  },
  {
    name: "PATCH billing-address",
    send: (sub, target) =>
      ctx
        .asSub(sub)
        .patch(`/companies/${target}/billing-address`)
        .send({ ...BILLING, ligne1: "1 rue Forgée" }),
  },
  {
    name: "PATCH contact",
    send: (sub, target) =>
      ctx
        .asSub(sub)
        .patch(`/companies/${target}/contact`)
        .send({ ...CONTACT, lastName: "Forgé" }),
  },
  {
    name: "PATCH contacts/:contactId",
    send: (sub, target) =>
      ctx
        .asSub(sub)
        .patch(`/companies/${target}/contacts/${contactId}`)
        .send({ ...CONTACT, lastName: "Forgé" }),
  },
  {
    name: "DELETE contacts/:contactId",
    send: (sub, target) => ctx.asSub(sub).delete(`/companies/${target}/contacts/${contactId}`),
  },
  {
    name: "PATCH delivery-addresses/:addressId",
    send: (sub, target) =>
      ctx
        .asSub(sub)
        .patch(`/companies/${target}/delivery-addresses/${addressId}`)
        .send(delivery("Forgée")),
  },
  {
    name: "PATCH delivery-addresses/:addressId/default",
    send: (sub, target) =>
      ctx.asSub(sub).patch(`/companies/${target}/delivery-addresses/${addressId}/default`),
  },
  {
    name: "DELETE delivery-addresses/:addressId",
    send: (sub, target) =>
      ctx.asSub(sub).delete(`/companies/${target}/delivery-addresses/${addressId}`),
  },
];

describe.each(WRITES)("le mur de « $name »", ({ send }) => {
  it("le gestionnaire d'une autre société reçoit 404, et rien n'est écrit", async () => {
    const before = await snapshot();

    const response = await send(OTHER_OWNER, companyId);

    expect(response.status).toBe(404);
    expect(await snapshot()).toEqual(before);
  });

  it("un simple membre reçoit 403, et rien n'est écrit", async () => {
    const before = await snapshot();

    const response = await send(MEMBER, companyId);

    expect(response.status).toBe(403);
    expect(await snapshot()).toEqual(before);
  });
});

/** Les routes qui désignent une adresse ou un contact par son id. */
const BY_ID = WRITES.filter((write) => write.name.includes(":"));

describe.each(BY_ID)("« $name » sur l'id d'une autre société", ({ send }) => {
  it("est refusé sous la société de l'appelant, et rien n'est écrit", async () => {
    const before = await snapshot();

    const response = await send(OTHER_OWNER, otherCompanyId);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(await snapshot()).toEqual(before);
  });
});

it("le témoin : le gestionnaire de la société écrit bien sur ces routes", async () => {
  await ctx
    .asSub(OWNER)
    .patch(`/companies/${companyId}/delivery-addresses/${addressId}`)
    .send(delivery("Atelier"))
    .expect(204);
  const address = await ctx.prisma.address.findUniqueOrThrow({ where: { id: addressId } });
  expect(address).toMatchObject({ kind: AddressKind.delivery, label: "Atelier" });
});

/**
 * Le numéro de TVA est contrôlé à l'activation et part sur les factures : une
 * fois la société active, son gestionnaire ne le change plus (409) ; il change
 * encore son enseigne en le renvoyant tel quel.
 */
it("le gestionnaire d'une société active ne change plus son numéro de TVA", async () => {
  const before = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });

  await ctx
    .asSub(OWNER)
    .patch(`/companies/${companyId}/identity`)
    .send({ enseigne: "Forgée", vatNumber: "DE123456789" })
    .expect(409);
  await ctx
    .asSub(OWNER)
    .patch(`/companies/${companyId}/identity`)
    .send({ enseigne: "Le Comptoir", vatNumber: before.vatNumber })
    .expect(204);

  const after = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  expect(after).toMatchObject({ enseigne: "Le Comptoir", vatNumber: before.vatNumber });
});
