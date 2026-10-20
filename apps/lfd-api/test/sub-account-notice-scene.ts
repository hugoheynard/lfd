/**
 * La scène des e2e d'avis au principal sur les gestes de site (plan
 * `documentation/comptes-client/plan-notifications-sous-comptes.md`, N4) : un
 * principal, un site rattaché, sa gouvernante (owner du site ET admin du
 * principal), et un membre par rôle chez le principal, plus une invitée jamais
 * acceptée. Sociétés et rattachements écrits par Prisma, comme
 * `sub-account-notices.e2e-spec.ts`.
 */
import { CustomerRole } from "../src/platform/database/client/client.js";
import { daysAgo, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

export interface NoticeScene {
  readonly principal: string;
  readonly site: string;
  /** Le `sub` de la gouvernante. */
  readonly housekeeper: string;
  readonly owner: string;
  readonly admin: string;
  readonly orders: string;
  readonly billing: string;
  readonly invited: string;
}

let seq = 0;

/** Un membre de `companyId`, désigné par son `sub` ; son courriel est `<sub>@alpes.test`. */
export async function noticeMember(
  ctx: E2eContext,
  companyId: string,
  role: CustomerRole,
  accepted = true,
): Promise<string> {
  const sub = `n4-${String((seq += 1))}`;
  const user = await createUser(ctx.prisma, { auth0Sub: sub, email: `${sub}@alpes.test` });
  await attachTo(ctx.prisma, user.id, companyId, role);
  if (accepted) {
    await ctx.prisma.membership.updateMany({
      where: { userId: user.id, companyId },
      data: { acceptedAt: new Date(daysAgo(10)) },
    });
  }
  return sub;
}

export async function noticeScene(ctx: E2eContext): Promise<NoticeScene> {
  const principal = (await createCompany(ctx.prisma, { raisonSociale: "SAS Alpes Chalets" })).id;
  const site = (await createCompany(ctx.prisma, { raisonSociale: "", enseigne: "Chalet Gentiane" }))
    .id;
  await ctx.prisma.company.update({ where: { id: site }, data: { parentCompanyId: principal } });
  const housekeeper = await noticeMember(ctx, site, CustomerRole.owner);
  const housekeeperId = (
    await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: housekeeper } })
  ).id;
  await ctx.prisma.membership.create({
    data: {
      userId: housekeeperId,
      companyId: principal,
      role: CustomerRole.admin,
      acceptedAt: new Date(daysAgo(10)),
    },
  });
  return {
    principal,
    site,
    housekeeper,
    owner: await noticeMember(ctx, principal, CustomerRole.owner),
    admin: await noticeMember(ctx, principal, CustomerRole.admin),
    orders: await noticeMember(ctx, principal, CustomerRole.orders),
    billing: await noticeMember(ctx, principal, CustomerRole.billing),
    invited: await noticeMember(ctx, principal, CustomerRole.orders, false),
  };
}

/** Le courriel d'un membre de la scène. */
export const mailOf = (sub: string): string => `${sub}@alpes.test`;

/** La charge JSON d'une ligne de la boîte d'envoi, en objet — sans cast. */
export function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}
