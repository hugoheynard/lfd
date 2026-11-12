/**
 * E2E du **premier choix du mode de facturation** sous le droit sociétés
 * (décidé par Hugo le 2026-11-12) : l'équipe qui ouvre un compte pose le
 * premier mode, et seulement le premier — le changer reste comptable.
 *
 * Ce que seul le vrai serveur prouve : la garde `b2b_companies` en écriture
 * résolue en base, sans `b2b_accounting:write` ; le 409 nommé ; le rejeu
 * identique qui ne réécrit rien.
 */
import type {
  BillingModeEntityView,
  InitialPayerBillingModeView,
  StaffResource,
} from "@lfd/contracts";

import { daysAgo, jsonBody } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import { BASE, ctx, declare, staff, useBillingModeScene } from "./billing-mode-scene.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

useBillingModeScene();

const route = (companyId: string): string => `/admin/companies/${companyId}/billing-mode/initial`;

/** Un membre du staff aux seuls droits listés, tout le reste refusé par son rôle. */
async function staffWith(
  sub: string,
  grants: readonly {
    resource: StaffResource;
    action: "read" | "write";
    effect: "allow" | "deny";
  }[],
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
  for (const grant of grants) {
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: member.id, ...grant },
    });
  }
}

const SOCIETES = [
  { resource: "b2b_companies", action: "read", effect: "allow" },
  { resource: "b2b_companies", action: "write", effect: "allow" },
  { resource: "b2b_accounting", action: "write", effect: "deny" },
] as const;

async function segments(companyId: string): Promise<number> {
  return ctx.prisma.payerBillingMode.count({ where: { payerCompanyId: companyId } });
}

describe("le premier choix du mode, sous le droit sociétés", () => {
  it("pose le premier choix (204), écrit un segment et le fait du journal", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Le Nouveau SAS" });
    await staffWith("staff-societes", SOCIETES);

    await ctx
      .asSub("staff-societes")
      .put(route(payer.id))
      .set(INTENT_KEY, freshIntent())
      .send({ legalEntityId: id, mode: "weekly" })
      .expect(204);

    expect(await segments(payer.id)).toBe(1);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: payer.id, type: "payer.billing_mode_changed" },
      }),
    ).toBe(1);
  });

  it("rejoue le même choix sans rien écrire, refuse un autre mode en 409", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Le Doublon SAS" });
    await staffWith("staff-societes", SOCIETES);
    const put = (mode: string) =>
      ctx
        .asSub("staff-societes")
        .put(route(payer.id))
        .set(INTENT_KEY, freshIntent())
        .send({ legalEntityId: id, mode });

    await put("weekly").expect(204);
    await put("weekly").expect(204);
    const refused = await put("semimonthly").expect(409);

    expect(refused.body).toMatchObject({ code: "accounting.payer_mode.already_chosen" });
    expect(await segments(payer.id)).toBe(1);
  });

  it("refuse sans b2b_companies:write (403), même avec le droit comptable, sans rien écrire", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma);
    await staffWith("staff-compta", [
      { resource: "b2b_companies", action: "read", effect: "allow" },
      { resource: "b2b_companies", action: "write", effect: "deny" },
      { resource: "b2b_accounting", action: "write", effect: "allow" },
    ]);

    await ctx
      .asSub("staff-compta")
      .put(route(payer.id))
      .set(INTENT_KEY, freshIntent())
      .send({ legalEntityId: id, mode: "weekly" })
      .expect(403);
    expect(await segments(payer.id)).toBe(0);
  });
});

describe("la lecture du premier choix, sous le droit sociétés", () => {
  const READER = [
    { resource: "b2b_companies", action: "read", effect: "allow" },
    { resource: "b2b_accounting", action: "read", effect: "deny" },
    { resource: "b2b_accounting", action: "write", effect: "deny" },
  ] as const;

  async function readAs(sub: string, companyId: string): Promise<InitialPayerBillingModeView> {
    return jsonBody<InitialPayerBillingModeView>(
      await ctx.asSub(sub).get(route(companyId)).expect(200),
    );
  }

  it("rend les entités et le mode déjà choisi sans aucun droit comptable (200)", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Le Lecteur SAS" });
    await staffWith("staff-societes", SOCIETES);
    await staffWith("staff-lecteur", READER);

    expect(await readAs("staff-lecteur", payer.id)).toEqual({
      entities: [{ id, name: "La Folie Douce" }],
      chosen: [],
      requiresChoice: true,
    });
    await ctx
      .asSub("staff-societes")
      .put(route(payer.id))
      .set(INTENT_KEY, freshIntent())
      .send({ legalEntityId: id, mode: "weekly" })
      .expect(204);
    expect((await readAs("staff-lecteur", payer.id)).chosen).toEqual([
      { legalEntityId: id, mode: "weekly" },
    ]);
  });

  it("refuse sans b2b_companies:read (403), même avec la lecture comptable", async () => {
    await declare();
    const payer = await createCompany(ctx.prisma);
    await staffWith("staff-sans-societes", [
      { resource: "b2b_companies", action: "read", effect: "deny" },
      { resource: "b2b_accounting", action: "read", effect: "allow" },
    ]);

    await ctx.asSub("staff-sans-societes").get(route(payer.id)).expect(403);
  });

  it("un site qui suit la facturation de son principal n'a pas de mode à choisir", async () => {
    await declare();
    const principal = await createCompany(ctx.prisma, { raisonSociale: "Groupe Payeur SAS" });
    const site = await createCompany(ctx.prisma, { raisonSociale: "Site Annexe SAS" });
    // Un site ne suit que son principal ACTUEL (`company_follows_parent`) : le rattachement d'abord.
    await ctx.prisma.company.update({
      where: { id: site.id },
      data: { parentCompanyId: principal.id },
    });
    await ctx.prisma.companyFollow.create({
      data: {
        companyId: site.id,
        parentId: principal.id,
        aspect: "billing",
        validFrom: new Date(daysAgo(30)),
        validTo: null,
      },
    });
    await staffWith("staff-lecteur", READER);

    expect((await readAs("staff-lecteur", site.id)).requiresChoice).toBe(false);
  });
});

describe("les entités du choix à l'ouverture d'un compte, sous le droit sociétés", () => {
  const ENTITIES = "/admin/companies/billing-mode/entities";

  it("rend les entités en service sans aucun droit comptable (200), l'archivée exclue", async () => {
    const id = await declare();
    const replacement = await declare("552081317", "La Folie Coffee");
    await staffWith("staff-ouverture", [
      { resource: "b2b_companies", action: "read", effect: "allow" },
      { resource: "b2b_accounting", action: "read", effect: "deny" },
      { resource: "b2b_accounting", action: "write", effect: "deny" },
    ]);
    const list = async (): Promise<BillingModeEntityView[]> =>
      jsonBody<BillingModeEntityView[]>(
        await ctx.asSub("staff-ouverture").get(ENTITIES).expect(200),
      );

    // L'ordre de la liste comptable : par nom.
    expect(await list()).toEqual([
      { id: replacement, name: "La Folie Coffee" },
      { id, name: "La Folie Douce" },
    ]);
    await staff()
      .put(`${BASE}/${id}/archived`)
      .set(INTENT_KEY, freshIntent())
      .send({ archived: true })
      .expect(204);
    expect(await list()).toEqual([{ id: replacement, name: "La Folie Coffee" }]);
  });

  it("refuse sans b2b_companies:read (403), même avec la lecture comptable", async () => {
    await declare();
    await staffWith("staff-sans-societes", [
      { resource: "b2b_companies", action: "read", effect: "deny" },
      { resource: "b2b_accounting", action: "read", effect: "allow" },
    ]);

    await ctx.asSub("staff-sans-societes").get(ENTITIES).expect(403);
  });
});
