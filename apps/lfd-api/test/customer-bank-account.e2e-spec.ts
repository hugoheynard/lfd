/**
 * E2E du **RIB d'une société côté client** — la section RIB de `/mon-compte`.
 *
 * Ce que ces e2e éprouvent et que les unitaires ne peuvent pas prouver :
 *
 * - que le mur lit le **vrai** rattachement en base : détenteur et facturation
 *   passent, `admin` et `orders` sont refusés (403), un membre d'une AUTRE
 *   société ne voit rien (404) ;
 * - que la réponse ne laisse sortir **ni l'IBAN entier ni les zones 14 et 19**,
 *   réglages du mandat qui restent au staff ;
 * - que le client et le staff écrivent la **même** ligne.
 *
 * Plan : `documentation/b2b/plan-rib-client.md`. Aucune frontière doublée : le
 * jeton porteur EST le `sub`, et tout le reste se joue en base.
 */
import type { CustomerBankAccountSectionView } from "@lfd/contracts";

import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/** IBAN d'exemple de la documentation bancaire française — clé mod-97 correcte. */
const IBAN = "FR1420041010050500013M02606";

const RIB = {
  iban: IBAN,
  bic: "CEPAFRPP751",
  holder: "Refuge du Col SARL",
  line1: "12 rue des Alpages",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};

const OWNER = "auth0|owner";
const BILLING = "auth0|billing";
const ADMIN = "auth0|admin";
const ORDERS = "auth0|orders";
const OUTSIDER = "auth0|outsider";

let ctx: E2eContext;
let companyId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

/** Une personne rattachée à une société avec un rôle donné. */
async function member(sub: string, targetCompanyId: string, role: CustomerRole): Promise<void> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub });
  await attachTo(ctx.prisma, user.id, targetCompanyId, role);
}

beforeEach(async () => {
  await ctx.reset();
  companyId = (await createCompany(ctx.prisma)).id;
  await member(OWNER, companyId, CustomerRole.owner);
  await member(BILLING, companyId, CustomerRole.billing);
  await member(ADMIN, companyId, CustomerRole.admin);
  await member(ORDERS, companyId, CustomerRole.orders);

  // Détenteur d'une AUTRE société : il a un vrai rôle, mais pas ici.
  const otherCompanyId = (await createCompany(ctx.prisma)).id;
  await member(OUTSIDER, otherCompanyId, CustomerRole.owner);
});

function bankAccountOf(id: string): string {
  return `/companies/${id}/bank-account`;
}

describe.each([
  ["le détenteur", OWNER],
  ["le rôle facturation", BILLING],
])("%s", (_label, sub) => {
  it("dépose le RIB (204) puis le relit, quatre caractères d'IBAN seulement", async () => {
    await ctx.asSub(sub).put(bankAccountOf(companyId)).send(RIB).expect(204);

    const response = await ctx.asSub(sub).get(bankAccountOf(companyId)).expect(200);
    const { account } = jsonBody<CustomerBankAccountSectionView>(response);

    expect(account).toEqual({
      holder: "Refuge du Col SARL",
      holderLegalForm: "",
      addressLine1: "12 rue des Alpages",
      addressLine2: "",
      postalCode: "73150",
      city: "Val d'Isère",
      countryCode: "FR",
      bic: "CEPAFRPP751",
      last4: "2606",
    });
  });

  /** 🔴 Une réponse qui porterait un IBAN entier finit dans un journal d'accès. */
  it("ne laisse sortir ni l'IBAN, ni le scellé, ni les zones du mandat", async () => {
    await ctx.asSub(sub).put(bankAccountOf(companyId)).send(RIB).expect(204);

    const response = await ctx.asSub(sub).get(bankAccountOf(companyId)).expect(200);
    const body = JSON.stringify(jsonBody(response));

    expect(body).not.toContain(IBAN);
    expect(body).not.toContain("20041010");
    expect(body).not.toContain("v1.");
    expect(body).not.toContain("debtorReference");
    expect(body).not.toContain("contractNumber");
  });

  it("rend { account: null } tant qu'aucun RIB n'a été déposé", async () => {
    const response = await ctx.asSub(sub).get(bankAccountOf(companyId)).expect(200);
    expect(jsonBody<CustomerBankAccountSectionView>(response).account).toBeNull();
  });
});

it("écrit la même ligne que le staff : un client a UN RIB", async () => {
  await ctx.asSub(OWNER).put(bankAccountOf(companyId)).send(RIB).expect(204);
  await ctx
    .asSub(BILLING)
    .put(bankAccountOf(companyId))
    .send({ ...RIB, holder: "Refuge du Col SAS" })
    .expect(204);

  const rows = await ctx.prisma.companyBankAccount.findMany({ where: { companyId } });
  expect(rows).toHaveLength(1);
  expect(rows[0]?.holder).toBe("Refuge du Col SAS");
  expect(rows[0]?.ibanSealed).not.toContain(IBAN);
});

describe.each([
  ["l'administrateur de l'espace", ADMIN],
  ["le rôle commandes", ORDERS],
])("%s", (_label, sub) => {
  it("est refusé en lecture (403)", async () => {
    await ctx.asSub(sub).get(bankAccountOf(companyId)).expect(403);
  });

  it("est refusé en écriture (403), et rien n'est écrit", async () => {
    await ctx.asSub(sub).put(bankAccountOf(companyId)).send(RIB).expect(403);
    expect(await ctx.prisma.companyBankAccount.count({ where: { companyId } })).toBe(0);
  });
});

describe("un membre d'une autre société", () => {
  it("ne voit pas la société (404, pas 403)", async () => {
    await ctx.asSub(OUTSIDER).get(bankAccountOf(companyId)).expect(404);
  });

  it("ne peut pas y déposer de RIB (404), même avec un IBAN invalide", async () => {
    // Le mur passe avant la validation : un 400 lui apprendrait que la société existe.
    await ctx
      .asSub(OUTSIDER)
      .put(bankAccountOf(companyId))
      .send({ ...RIB, iban: "FR1420041010050500013M02607" })
      .expect(404);
    expect(await ctx.prisma.companyBankAccount.count({ where: { companyId } })).toBe(0);
  });
});

describe("refus de forme et de domaine", () => {
  it("refuse un IBAN dont la clé de contrôle ne tombe pas (400)", async () => {
    const bad = "FR1420041010050500013M02607";
    const response = await ctx
      .asSub(OWNER)
      .put(bankAccountOf(companyId))
      .send({ ...RIB, iban: bad })
      .expect(400);
    // Un IBAN mal saisi est à un caractère du vrai : il ne repart pas.
    expect(JSON.stringify(jsonBody(response))).not.toContain(bad);
  });

  it("refuse un RIB à moitié rempli (400)", async () => {
    await ctx
      .asSub(BILLING)
      .put(bankAccountOf(companyId))
      .send({ ...RIB, bic: "" })
      .expect(400);
  });

  it("refuse un appel sans jeton (401)", async () => {
    await ctx.http().get(bankAccountOf(companyId)).expect(401);
  });
});
