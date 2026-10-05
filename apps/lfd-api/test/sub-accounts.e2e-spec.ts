/**
 * E2E des **sous-comptes** (plan `documentation/b2b/plan-sous-comptes.md`,
 * lot S1) : créer, rattacher, détacher, suivre — sur le vrai Postgres.
 *
 * Ce que seul l'e2e prouve : la contrainte d'exclusion des périodes, les
 * déclencheurs de seconde ligne, le verrou consultatif entre DEUX
 * transactions réelles, et la porte staff `b2b_pricing` devant le suivi du
 * tarif (Q9).
 *
 * Seule frontière doublée : la signature du jeton staff — le jeton EST le `sub`.
 */
import type { AdminCompanyFicheView, AdminCompanyView, CreatedIdResponse } from "@lfd/contracts";

import { CompanyFollowsReader } from "../src/b2b/account/domain/ports/company-follows.reader.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** Une comptable : la fiche client en lecture, la tarification en lecture — pas de quoi décider d'un tarif. */
const ACCOUNTANT = { sub: "staff-comptable", role: "comptabilite", id: "fiche-comptable" } as const;

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
  await ctx.prisma.staffUser.create({
    data: {
      id: ACCOUNTANT.id,
      firstName: "Fiche",
      lastName: "Comptable",
      email: "comptable@lfc.test",
      role: ACCOUNTANT.role,
      status: "active",
      auth0Id: ACCOUNTANT.sub,
    },
  });
});

const admin = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

const DELIVERY = {
  label: "Chalet",
  ligne1: "12 route des Praz",
  ligne2: "",
  codePostal: "74400",
  ville: "Chamonix",
  pays: "France",
  isDefault: true,
  specs: {
    signatureRequired: false,
    note: "",
    slots: { mode: "everyday", slot: null },
    deliveryContact: null,
    gps: null,
  },
};

/** Un chalet : enseigne seule et une adresse de livraison — ni TVA ni facturation propres. */
async function createChalet(parentId: string, follows: readonly string[]): Promise<string> {
  const response = await admin()
    .post(`/admin/companies/${parentId}/sub-accounts`)
    .send({
      enseigne: "Chalet Edelweiss",
      deliveryAddress: DELIVERY,
      follows,
    })
    .expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

async function fiche(companyId: string): Promise<AdminCompanyFicheView> {
  return jsonBody<AdminCompanyFicheView>(
    await admin().get(`/admin/companies/${companyId}`).expect(200),
  );
}

async function principal(status: "active" | "pending" = "active"): Promise<string> {
  return (await createCompany(ctx.prisma, { enseigne: "Alpes Chalets", status })).id;
}

describe("Créer un sous-compte", () => {
  it("naît pending, rattaché, avec son adresse et ses suivis ; les deux fiches le disent", async () => {
    const groupe = await principal();

    const chalet = await createChalet(groupe, ["billing", "contacts"]);

    const row = await ctx.prisma.company.findUniqueOrThrow({ where: { id: chalet } });
    expect(row.status).toBe("pending");
    expect(row.parentCompanyId).toBe(groupe);

    const child = await fiche(chalet);
    expect(child.hierarchy.parent).toEqual({
      id: groupe,
      enseigne: "Alpes Chalets",
      status: "active",
    });
    expect(child.hierarchy.follows.map((follow) => follow.aspect).sort()).toEqual([
      "billing",
      "contacts",
    ]);

    const parent = await fiche(groupe);
    const [listed] = parent.hierarchy.subAccounts;
    expect(parent.hierarchy.subAccounts).toHaveLength(1);
    expect(listed).toMatchObject({
      id: chalet,
      enseigne: "Chalet Edelweiss",
      city: "Chamonix",
      status: "pending",
    });
    expect([...(listed?.followedAspects ?? [])].sort()).toEqual(["billing", "contacts"]);

    const list = jsonBody<AdminCompanyView[]>(await admin().get("/admin/companies").expect(200));
    expect(list.find((company) => company.id === chalet)?.parent).toEqual({
      id: groupe,
      enseigne: "Alpes Chalets",
    });
    expect(list.find((company) => company.id === groupe)?.parent).toBeNull();
  });

  it("se crée au NOM SEUL, puis se complète par les gestes existants de la fiche", async () => {
    const groupe = await principal();

    const created = await admin()
      .post(`/admin/companies/${groupe}/sub-accounts`)
      .send({ enseigne: "Club Med Tignes", follows: [] })
      .expect(201);
    const entity = jsonBody<CreatedIdResponse>(created).id;

    const row = await ctx.prisma.company.findUniqueOrThrow({ where: { id: entity } });
    expect(row).toMatchObject({ status: "pending", parentCompanyId: groupe, siret: "" });
    expect((await fiche(groupe)).hierarchy.subAccounts[0]).toMatchObject({
      id: entity,
      city: null,
    });

    await admin().post(`/admin/companies/${entity}/delivery-addresses`).send(DELIVERY).expect(201);
    await admin()
      .patch(`/admin/companies/${entity}/identity`)
      .send({
        enseigne: "Club Med Tignes",
        raisonSociale: "Club Med Tignes SAS",
        formeJuridique: "SAS",
        siret: "73282932000074",
      })
      .expect(204);

    const completed = await ctx.prisma.company.findUniqueOrThrow({ where: { id: entity } });
    expect(completed).toMatchObject({
      raisonSociale: "Club Med Tignes SAS",
      siret: "73282932000074",
    });
    expect((await fiche(groupe)).hierarchy.subAccounts[0]?.city).toBe("Chamonix");
  });

  it("refuse de créer le sous-compte d'un sous-compte", async () => {
    const chalet = await createChalet(await principal(), []);

    await admin()
      .post(`/admin/companies/${chalet}/sub-accounts`)
      .send({ enseigne: "Annexe", deliveryAddress: DELIVERY })
      .expect(409);
  });
});

describe("Le chalet sans SIRET (plan-sous-comptes §2.1 bis)", () => {
  it("s'active en suivant la facturation, puis cesser de la suivre ramène l'identité manquante", async () => {
    const groupe = await principal();
    const chalet = await createChalet(groupe, ["billing"]);
    // Ce que la porte exige encore du chalet : un numéro joignable (la livraison).
    await admin()
      .post(`/admin/companies/${chalet}/contacts`)
      .send({
        firstName: "Paul",
        lastName: "Gardien",
        email: "paul@chalet.fr",
        phone: "06 12 34 56 78",
        role: "orders",
      })
      .expect(201);

    expect((await fiche(chalet)).gate.blocking).toEqual([]);
    await admin().post(`/admin/companies/${chalet}/activate`).expect(204);
    expect((await ctx.prisma.company.findUniqueOrThrow({ where: { id: chalet } })).status).toBe(
      "active",
    );

    await admin()
      .post(`/admin/companies/${chalet}/follows/stop`)
      .send({ aspect: "billing" })
      .expect(204);

    const after = await fiche(chalet);
    expect(after.hierarchy.follows).toEqual([]);
    expect(after.gate.blocking).toEqual(expect.arrayContaining(["identite_legale", "detenteur"]));
  });

  it("refuse de suivre la facturation d'un principal en attente", async () => {
    const groupe = await principal("pending");
    const chalet = await createChalet(groupe, []);

    await admin()
      .post(`/admin/companies/${chalet}/follows`)
      .send({ aspect: "billing" })
      .expect(409);
  });
});

describe("Le suivi du tarif est daté, et c'est une décision de tarification (Q9)", () => {
  it("se lit à date : rien avant, la période pendant, rien après", async () => {
    const chalet = await createChalet(await principal(), []);

    await admin().post(`/admin/companies/${chalet}/pricing-follow`).expect(204);
    await admin().post(`/admin/companies/${chalet}/pricing-follow/stop`).expect(204);

    const period = await ctx.prisma.companyFollow.findFirstOrThrow({
      where: { companyId: chalet, aspect: "pricing" },
    });
    const validTo = period.validTo;
    expect(validTo).not.toBeNull();
    const reader = ctx.app.get(CompanyFollowsReader);
    const before = new Date(period.validFrom.getTime() - 1);

    expect(await reader.followsAt(chalet, "pricing", before)).toBeNull();
    expect((await reader.followsAt(chalet, "pricing", period.validFrom))?.parentId).toBe(
      period.parentId,
    );
    expect(await reader.followsAt(chalet, "pricing", validTo ?? before)).toBeNull();
  });

  it("refuse le suivi du tarif à qui n'a pas le droit de tarification", async () => {
    const chalet = await createChalet(await principal(), []);

    await ctx.asSub(ACCOUNTANT.sub).post(`/admin/companies/${chalet}/pricing-follow`).expect(403);
    expect(await ctx.prisma.companyFollow.count({ where: { companyId: chalet } })).toBe(0);
  });

  it("la route de la fiche ne laisse pas passer le tarif", async () => {
    const chalet = await createChalet(await principal(), []);

    await admin()
      .post(`/admin/companies/${chalet}/follows`)
      .send({ aspect: "pricing" })
      .expect(400);
  });
});

describe("Rattacher et détacher", () => {
  it("rattache un client existant, puis le détache en fermant ses suivis", async () => {
    const groupe = await principal();
    const client = (await createCompany(ctx.prisma, { enseigne: "Club Med Tignes" })).id;

    await admin().post(`/admin/companies/${client}/parent`).send({ parentId: groupe }).expect(204);
    await admin().post(`/admin/companies/${client}/pricing-follow`).expect(204);
    await admin().post(`/admin/companies/${client}/parent/detach`).expect(204);

    const row = await ctx.prisma.company.findUniqueOrThrow({ where: { id: client } });
    expect(row.parentCompanyId).toBeNull();
    const open = await ctx.prisma.companyFollow.count({
      where: { companyId: client, validTo: null },
    });
    expect(open).toBe(0);
    // Rien ne s'efface : la période close reste.
    expect(await ctx.prisma.companyFollow.count({ where: { companyId: client } })).toBe(1);
  });

  it("refuse un principal qui est son propre sous-compte, et un cycle", async () => {
    const groupe = await principal();
    const chalet = await createChalet(groupe, []);

    await admin().post(`/admin/companies/${groupe}/parent`).send({ parentId: groupe }).expect(400);
    await admin().post(`/admin/companies/${groupe}/parent`).send({ parentId: chalet }).expect(409);
  });
});

/**
 * Les deux courses du §5, avec deux transactions RÉELLES (le pool en ouvre
 * cinq). Sans le verrou consultatif, chacune passait les déclencheurs : en
 * READ COMMITTED, aucune ne voyait l'écriture de l'autre.
 */
describe("Les courses sur la hiérarchie (§5)", () => {
  async function three(): Promise<readonly [string, string, string]> {
    const [a, b, c] = await Promise.all(
      ["A", "B", "C"].map((name) => createCompany(ctx.prisma, { enseigne: `Société ${name}` })),
    );
    if (a === undefined || b === undefined || c === undefined) {
      throw new Error("semis incomplet");
    }
    return [a.id, b.id, c.id];
  }

  const attach = (child: string, parent: string): Promise<number> =>
    admin()
      .post(`/admin/companies/${child}/parent`)
      .send({ parentId: parent })
      .then((response) => response.status);

  /** Aucune société dont le principal a lui-même un principal. */
  async function depthTwoCount(): Promise<number> {
    return ctx.prisma.company.count({
      where: { parentCompany: { parentCompanyId: { not: null } } },
    });
  }

  it("A→B pendant B→C : une seule passe, la profondeur reste 1", async () => {
    for (let round = 0; round < 3; round += 1) {
      await ctx.reset();
      const [a, b, c] = await three();

      const statuses = await Promise.all([attach(a, b), attach(b, c)]);

      expect([...statuses].sort()).toEqual([204, 409]);
      expect(await depthTwoCount()).toBe(0);
    }
  });

  it("A→B pendant B→A : une seule passe, pas de cycle", async () => {
    for (let round = 0; round < 3; round += 1) {
      await ctx.reset();
      const [a, b] = await three();

      const statuses = await Promise.all([attach(a, b), attach(b, a)]);

      expect([...statuses].sort()).toEqual([204, 409]);
      const linked = await ctx.prisma.company.count({ where: { parentCompanyId: { not: null } } });
      expect(linked).toBe(1);
    }
  });

  it("le déclencheur refuse une écriture faite HORS du geste (seconde ligne)", async () => {
    const [a, b, c] = await three();
    await ctx.prisma.company.update({ where: { id: b }, data: { parentCompanyId: c } });

    await expect(
      ctx.prisma.company.update({ where: { id: a }, data: { parentCompanyId: b } }),
    ).rejects.toThrow(/company_hierarchy_depth/u);
  });
});
