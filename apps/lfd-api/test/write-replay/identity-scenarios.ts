import { CustomerRole, UserStatus } from "../../src/platform/database/client/client.js";
import { daysAgo, type E2eContext } from "../e2e-harness.js";
import { attachTo, createCompany, createUser } from "../factories.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";

const INVITED = "auth0|replay-invited";

/** Une fiche staff, au statut et à l'invitation donnés. */
async function staffFiche(ctx: E2eContext, status: "invited" | "active"): Promise<string> {
  const fiche = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Paul",
      lastName: "Girard",
      email: "paul@lfc.test",
      role: "comptabilite",
      status,
      auth0Id: "auth0|paul@lfc.test",
      invitedAt: new Date(daysAgo(21)),
    },
  });
  return fiche.id;
}

/** Les accès : liens de mot de passe, invitations, statut d'un membre du staff. */
export const IDENTITY_SCENARIOS: ScenarioSet = {
  [routeKey("lafoliecoffee/account/http/admin-access-pending.controller.ts", "issueLink")]: async ({
    ctx,
  }) => {
    const company = await createCompany(ctx.prisma);
    const user = await createUser(ctx.prisma, {
      auth0Sub: INVITED,
      email: "pro@replay.test",
      firstName: "Pierre",
      lastName: "Marchand",
      status: UserStatus.invited,
    });
    await attachTo(ctx.prisma, user.id, company.id, CustomerRole.admin);
    await ctx.prisma.membership.update({
      where: { userId_companyId: { userId: user.id, companyId: company.id } },
      data: { invitedAt: new Date(daysAgo(21)) },
    });
    return {
      sub: STAFF,
      path: `/admin/access-pending/${user.id}/link`,
      body: { companyId: company.id },
      replay: "shown-once",
    };
  },

  [routeKey("staff/invitations/admin-staff-access-pending.controller.ts", "issueLink")]: async ({
    ctx,
  }) => ({
    sub: STAFF,
    path: `/admin/staff-access-pending/${await staffFiche(ctx, "invited")}/link`,
    replay: "shown-once",
  }),

  [routeKey("staff/directory/http/admin-staff-users.controller.ts", "setStatus")]: async ({
    ctx,
  }) => ({
    sub: STAFF,
    path: `/admin/staff-users/${await staffFiche(ctx, "active")}/status`,
    body: { status: "suspended" },
  }),
};
