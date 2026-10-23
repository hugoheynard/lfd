import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { context } from "./order-staff-cancel-scene.js";
import { company, customer, member } from "./order-customer-cancel-scene.js";

/**
 * **La famille des e2e de S6** (plan
 * `documentation/comptes-client/plan-entrer-dans-ses-sites.md`, §3) : un
 * principal, deux sites frères, un détenteur par société, et les héritiers du
 * principal. Rattachements ACCEPTÉS, semés par Prisma (dette de
 * `test/factories.ts`) ; tous les gestes passent par HTTP.
 */
export type Person = Awaited<ReturnType<typeof customer>>;

export interface Family {
  readonly principal: string;
  readonly site: string;
  readonly sibling: string;
  /** Détenteur du principal : l'héritier qui lit aussi la facturation (Q1). */
  readonly heir: Person;
  /** Administrateur du principal : héritier plafonné, sans la facturation. */
  readonly adminHeir: Person;
  readonly siteOwner: Person;
  readonly siblingOwner: Person;
}

export async function family(): Promise<Family> {
  const principal = await company();
  const site = await company();
  const sibling = await company();
  await context().prisma.company.updateMany({
    where: { id: { in: [site, sibling] } },
    data: { parentCompanyId: principal },
  });
  const heir = await customer();
  await member(heir.id, principal, { role: CustomerRole.owner });
  const adminHeir = await customer();
  await member(adminHeir.id, principal, { role: CustomerRole.admin });
  const siteOwner = await customer();
  await member(siteOwner.id, site, { role: CustomerRole.owner });
  const siblingOwner = await customer();
  await member(siblingOwner.id, sibling, { role: CustomerRole.owner });
  return { principal, site, sibling, heir, adminHeir, siteOwner, siblingOwner };
}

/** Détacher le site de son principal (R6) — l'effet du geste staff, pas le geste. */
export async function detach(siteId: string): Promise<void> {
  await context().prisma.company.update({ where: { id: siteId }, data: { parentCompanyId: null } });
}

/** Poser un statut sur une société (R1 : principal actif, site non suspendu). */
export async function setStatus(companyId: string, status: CompanyStatus): Promise<void> {
  await context().prisma.company.update({ where: { id: companyId }, data: { status } });
}
