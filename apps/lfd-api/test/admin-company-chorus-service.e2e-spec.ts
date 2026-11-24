/**
 * E2E de **la fiche du service Chorus** d'une société qui commande
 * (`PUT /admin/companies/:companyId/chorus-service`, plan des clients publics,
 * § 6 octies, P2 ter).
 *
 * Ce que seul le vrai serveur prouve : le payeur résolu en base sur le suivi
 * `billing` en cours, la ligne rangée avec la parole de l'agent et son fait au
 * journal, le CHECK numéro ⇔ date de fin, les deux refus, la fiche servie au
 * staff, et la vue des exigences qui propose le code et l'engagement de
 * l'unité — sauf quand elle a changé de principal.
 *
 * Aucune date comparée à l'horloge : la date de fin de l'engagement est
 * servie telle quelle (l'écran la compare à la livraison), et les débuts de
 * suivi sont relatifs à maintenant.
 */
import { CHORUS_SERVICE_ERRORS, type BudgetCommitmentRequirementsView } from "@lfd/contracts";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const UNIT_BUYER = "auth0|unite-tignes";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const route = (companyId: string): string => `/admin/companies/${companyId}/chorus-service`;

/** Ce que porte le bon de l'unité. La date de fin n'est comparée à aucune horloge. */
const SHEET = {
  serviceCode: "UNITE-TIGNES",
  commitmentNumber: "1300012345",
  commitmentEndsOn: "2026-12-31",
};

/** Un principal public actif, au compte, avec sa fiche Chorus : le SIRET de facturation. */
async function publicPrincipal(name: string, defaultServiceCode: string): Promise<string> {
  const company = await createCompany(ctx.prisma, {
    status: CompanyStatus.active,
    raisonSociale: name,
  });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { formeJuridique: "public_state", grantedTerms: ["monthly"] },
  });
  await ctx.prisma.companyChorusRouting.create({
    data: {
      companyId: company.id,
      commitmentRequired: true,
      serviceCodeRequired: true,
      defaultServiceCode,
      checkedOn: new Date(daysAgo(1).slice(0, 10)),
      checkedByStaffId: E2E_STAFF_ID,
    },
  });
  return company.id;
}

/** Le site suit la facturation de son principal ACTUEL (contrainte `company_follows_parent`). */
async function followBilling(siteId: string, parentId: string, since: string): Promise<void> {
  await ctx.prisma.company.update({ where: { id: siteId }, data: { parentCompanyId: parentId } });
  await ctx.prisma.companyFollow.create({
    data: {
      companyId: siteId,
      parentId,
      aspect: "billing",
      validFrom: new Date(since),
      validTo: null,
    },
  });
}

/** Une unité sans forme juridique ni SIRET, qui suit la facturation du principal. */
async function unitUnder(principalId: string): Promise<string> {
  const unit = await createCompany(ctx.prisma, {
    raisonSociale: "Unité de Tignes",
    siret: "",
    siren: "",
  });
  await ctx.prisma.company.update({ where: { id: unit.id }, data: { formeJuridique: "" } });
  await followBilling(unit.id, principalId, daysAgo(30));
  const buyer = await createUser(ctx.prisma, { auth0Sub: UNIT_BUYER });
  await attachTo(ctx.prisma, buyer.id, unit.id, CustomerRole.owner);
  return unit.id;
}

async function requirementsOf(sub: string): Promise<BudgetCommitmentRequirementsView> {
  return jsonBody<BudgetCommitmentRequirementsView>(
    await ctx.asSub(sub).get("/me/budget-commitment-requirements").expect(200),
  );
}

describe("la fiche du service Chorus d'une unité", () => {
  it("se range sous le payeur actuel, avec la parole de l'agent et son fait", async () => {
    const principalId = await publicPrincipal("Armées — Commissariat Sud-Est", "PLATEFORME");
    const unitId = await unitUnder(principalId);

    await ctx.asSub(E2E_STAFF_SUB).put(route(unitId)).send(SHEET).expect(204);

    const row = await ctx.prisma.companyChorusService.findUniqueOrThrow({
      where: { companyId: unitId },
    });
    expect(row).toMatchObject({
      payerCompanyId: principalId,
      serviceCode: "UNITE-TIGNES",
      commitmentNumber: "1300012345",
      recordedByStaffId: E2E_STAFF_ID,
    });
    expect(row.commitmentEndsOn?.toISOString().slice(0, 10)).toBe(SHEET.commitmentEndsOn);
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { subjectId: unitId, type: "company.chorus_service_recorded" },
    });
    expect(fact.payload).toMatchObject({ ...SHEET, payerCompanyId: principalId });

    const fiche = await ctx.asSub(E2E_STAFF_SUB).get(`/admin/companies/${unitId}`).expect(200);
    expect(fiche.body).toMatchObject({
      chorusService: {
        payerCompanyId: principalId,
        serviceCode: "UNITE-TIGNES",
        currentCommitment: { number: "1300012345", endsOn: SHEET.commitmentEndsOn },
      },
    });
  });

  it("n'écrit pas de second fait quand la même fiche est reposée", async () => {
    const principalId = await publicPrincipal("Armées", "PLATEFORME");
    const unitId = await unitUnder(principalId);
    await ctx.asSub(E2E_STAFF_SUB).put(route(unitId)).send(SHEET).expect(204);

    await ctx.asSub(E2E_STAFF_SUB).put(route(unitId)).send(SHEET).expect(204);

    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: unitId, type: "company.chorus_service_recorded" },
      }),
    ).toBe(1);
  });

  it("refuse un numéro sans date de fin (400), sans rien écrire", async () => {
    const principalId = await publicPrincipal("Armées", "PLATEFORME");
    const unitId = await unitUnder(principalId);

    const refused = await ctx
      .asSub(E2E_STAFF_SUB)
      .put(route(unitId))
      .send({ ...SHEET, commitmentEndsOn: null })
      .expect(400);

    expect(refused.body).toMatchObject({ code: CHORUS_SERVICE_ERRORS.invalid });
    expect(await ctx.prisma.companyChorusService.count()).toBe(0);
  });

  it("est refusée sur un payeur privé (409), sans rien écrire", async () => {
    const company = await createCompany(ctx.prisma);

    const refused = await ctx
      .asSub(E2E_STAFF_SUB)
      .put(route(company.id))
      .send({ ...SHEET, serviceCode: "" })
      .expect(409);

    expect(refused.body).toMatchObject({ code: CHORUS_SERVICE_ERRORS.payerNotPublic });
    expect(await ctx.prisma.companyChorusService.count()).toBe(0);
  });

  it("refuse un code service sur un payeur seul (409), et admet l'engagement seul", async () => {
    const soleId = await publicPrincipal("Lycée du Mont-Blanc", "LYCEE");

    const refused = await ctx.asSub(E2E_STAFF_SUB).put(route(soleId)).send(SHEET).expect(409);
    expect(refused.body).toMatchObject({ code: CHORUS_SERVICE_ERRORS.serviceCodeOnSolePayer });
    expect(await ctx.prisma.companyChorusService.count()).toBe(0);

    await ctx
      .asSub(E2E_STAFF_SUB)
      .put(route(soleId))
      .send({ ...SHEET, serviceCode: "" })
      .expect(204);
    expect(
      await ctx.prisma.companyChorusService.findUniqueOrThrow({ where: { companyId: soleId } }),
    ).toMatchObject({ payerCompanyId: soleId, serviceCode: "" });
  });

  it("rend 404 sur une société inconnue", async () => {
    await ctx.asSub(E2E_STAFF_SUB).put(route("societe-absente")).send(SHEET).expect(404);
  });
});

describe("la fiche staff dit si le payeur admet le service Chorus", () => {
  const payerIsPublic = async (companyId: string): Promise<unknown> =>
    jsonBody<{ chorusServicePayerIsPublic: unknown }>(
      await ctx.asSub(E2E_STAFF_SUB).get(`/admin/companies/${companyId}`).expect(200),
    ).chorusServicePayerIsPublic;

  it("vrai sur une unité facturée à un principal public, et sur le principal", async () => {
    const principalId = await publicPrincipal("Armée de terre", "ARMEE");
    const unitId = await unitUnder(principalId);

    expect(await payerIsPublic(unitId)).toBe(true);
    expect(await payerIsPublic(principalId)).toBe(true);
  });

  it("faux sur une société privée, et sur un site facturé à un principal privé", async () => {
    const principal = await createCompany(ctx.prisma, { raisonSociale: "Chalets SAS" });
    const site = await createCompany(ctx.prisma, {
      raisonSociale: "Chalet Arolle",
      siret: "",
      siren: "",
    });
    await followBilling(site.id, principal.id, daysAgo(30));

    expect(await payerIsPublic(principal.id)).toBe(false);
    expect(await payerIsPublic(site.id)).toBe(false);
  });
});

describe("la vue des exigences de l'engagement", () => {
  it("propose le code et l'engagement de l'unité, avec les exigences du principal", async () => {
    const principalId = await publicPrincipal("Armées", "PLATEFORME");
    const unitId = await unitUnder(principalId);
    await ctx.asSub(E2E_STAFF_SUB).put(route(unitId)).send(SHEET).expect(204);

    expect(await requirementsOf(UNIT_BUYER)).toEqual({
      payerCompanyId: principalId,
      publicPayer: true,
      commitmentRequired: true,
      serviceCodeRequired: true,
      defaultServiceCode: "UNITE-TIGNES",
      currentCommitment: { number: "1300012345", endsOn: SHEET.commitmentEndsOn },
    });
    const forStaff = await ctx
      .asSub(E2E_STAFF_SUB)
      .get(`/admin/companies/${unitId}/budget-commitment-requirements`)
      .expect(200);
    expect(forStaff.body).toMatchObject({ defaultServiceCode: "UNITE-TIGNES" });
  });

  it("ignore la fiche quand l'unité a changé de principal", async () => {
    const firstId = await publicPrincipal("Armées — Sud-Est", "SUD-EST");
    const unitId = await unitUnder(firstId);
    await ctx.asSub(E2E_STAFF_SUB).put(route(unitId)).send(SHEET).expect(204);
    const secondId = await publicPrincipal("Armées — Nord-Est", "NORD-EST");
    const switchedAt = daysAgo(1);
    await ctx.prisma.companyFollow.updateMany({
      where: { companyId: unitId, aspect: "billing", validTo: null },
      data: { validTo: new Date(switchedAt) },
    });
    // Détaché d'abord (`company_parent_replaced`), puis rattaché au second.
    await ctx.prisma.company.update({ where: { id: unitId }, data: { parentCompanyId: null } });
    await followBilling(unitId, secondId, switchedAt);

    expect(await requirementsOf(UNIT_BUYER)).toMatchObject({
      payerCompanyId: secondId,
      defaultServiceCode: "NORD-EST",
      currentCommitment: null,
    });
  });
});
