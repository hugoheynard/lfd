/**
 * E2E du **premier choix du mode de facturation** sous le droit sociétés
 * (décidé par Hugo le 2026-11-12) : l'équipe qui ouvre un compte pose le
 * premier mode, et seulement le premier — le changer reste comptable.
 *
 * Ce que seul le vrai serveur prouve : la garde `b2b_companies` en écriture
 * résolue en base, sans `b2b_accounting:write` ; le 409 nommé ; le rejeu
 * identique qui ne réécrit rien.
 */
import { createCompany } from "./factories.js";
import { ctx, declare, useBillingModeScene } from "./billing-mode-scene.js";

useBillingModeScene();

const route = (companyId: string): string => `/admin/companies/${companyId}/billing-mode/initial`;

/** Un membre du staff aux seuls droits listés, tout le reste refusé par son rôle. */
async function staffWith(
  sub: string,
  grants: readonly { resource: string; action: "read" | "write"; effect: "allow" | "deny" }[],
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
      ctx.asSub("staff-societes").put(route(payer.id)).send({ legalEntityId: id, mode });

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
      .send({ legalEntityId: id, mode: "weekly" })
      .expect(403);
    expect(await segments(payer.id)).toBe(0);
  });
});
