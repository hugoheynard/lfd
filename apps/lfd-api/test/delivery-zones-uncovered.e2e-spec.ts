/**
 * E2E des **codes postaux de livraison non couverts**
 * (`GET /admin/delivery-zones/uncovered-postal-codes`).
 *
 * Ce que seul le vrai chemin prouve : la lecture traverse le port qu'`account/`
 * implémente sur la vraie table des adresses, ne retient que les adresses de
 * LIVRAISON vivantes des comptes servis, et rapproche par la règle du checkout
 * (le préfixe le plus court qui couvre suffit).
 */
import type { UncoveredPostalCodeView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const ROUTE = "/admin/delivery-zones/uncovered-postal-codes";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function addAddress(
  companyId: string,
  codePostal: string,
  ville: string,
  kind: "delivery" | "billing" = "delivery",
): Promise<void> {
  await ctx.prisma.address.create({
    data: {
      companyId,
      kind,
      label: ville,
      ligne1: "1 rue du Test",
      codePostal,
      ville,
      pays: "France",
    },
  });
}

async function seedZone(postalPrefixes: readonly string[]): Promise<void> {
  await staff()
    .post("/admin/delivery-zones")
    .send({ label: "Tarentaise", postalPrefixes, fee: { mode: "amount", cents: 1_500 } })
    .expect(201);
}

async function uncovered(): Promise<readonly UncoveredPostalCodeView[]> {
  return jsonBody<readonly UncoveredPostalCodeView[]>(await staff().get(ROUTE).expect(200));
}

describe("GET /admin/delivery-zones/uncovered-postal-codes", () => {
  it("rend le code non couvert avec son compte, et tait le code couvert", async () => {
    await seedZone(["73150"]);
    const covered = await createCompany(ctx.prisma, { raisonSociale: "Le Refuge SAS" });
    const stranded = await createCompany(ctx.prisma, {
      raisonSociale: "La Folie SAS",
      enseigne: "La Folie",
    });
    await addAddress(covered.id, "73150", "Val d'Isère");
    await addAddress(stranded.id, "73320", "Tignes");

    expect(await uncovered()).toEqual([
      {
        postalCode: "73320",
        cities: ["Tignes"],
        companyCount: 1,
        companies: [{ id: stranded.id, name: "La Folie" }],
      },
    ]);
  });

  it("tient pour couvert un code qu'un préfixe plus court couvre", async () => {
    await seedZone(["733"]);
    const company = await createCompany(ctx.prisma);
    await addAddress(company.id, "73320", "Tignes");

    expect(await uncovered()).toEqual([]);
  });

  it("ignore la facturation, les adresses archivées et les comptes résiliés", async () => {
    const company = await createCompany(ctx.prisma);
    const terminated = await createCompany(ctx.prisma, { status: CompanyStatus.terminated });
    await addAddress(company.id, "74400", "Chamonix", "billing");
    await addAddress(terminated.id, "74400", "Chamonix");
    await ctx.prisma.address.create({
      data: {
        companyId: company.id,
        kind: "delivery",
        label: "Ancien",
        ligne1: "2 rue du Test",
        codePostal: "74400",
        ville: "Chamonix",
        pays: "France",
        archivedAt: new Date(0),
      },
    });

    expect(await uncovered()).toEqual([]);
  });
});
