import { Injectable } from "@nestjs/common";
import { isPublicLegalForm, toLegalForm } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  BasketBuyerStanding,
  type BasketCompanyMember,
  type BasketFactSite,
} from "../../../recurring/channels/commerce/index.js";
import { CompanyNameReader } from "../domain/ports/company-name.reader.js";
import { MembershipReader } from "../domain/ports/membership.reader.js";
import { SitePrincipalLock } from "../domain/ports/site-principal.lock.js";

/**
 * **Ce que les paniers récurrents demandent des comptes** — le port qu'ils
 * déclarent, implémenté par les comptes, qui possèdent les rattachements. Le
 * rôle se lit par la lecture partagée (`MembershipReader`, donc
 * `readCompanyStanding`) ; les membres d'une société, par ses rattachements
 * directs, nommés comme dans les écrans du staff.
 */
@Injectable()
export class AccountBasketBuyerStanding extends BasketBuyerStanding {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly names: CompanyNameReader,
    private readonly prisma: PrismaService,
    private readonly principals: SitePrincipalLock,
  ) {
    super();
  }

  async isMember(userId: string, companyId: string): Promise<boolean> {
    return (await this.memberships.roleOf(userId, companyId)) !== null;
  }

  companyName(companyId: string): Promise<string | null> {
    return this.names.nameOf(companyId);
  }

  async membersOf(companyId: string): Promise<readonly BasketCompanyMember[]> {
    const rows = await this.prisma.membership.findMany({
      where: { companyId },
      select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return rows.map(({ user }) => ({ userId: user.id, name: displayName(user) }));
  }

  async isPublicPayer(companyId: string): Promise<boolean> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { formeJuridique: true },
    });
    const form = company === null ? null : toLegalForm(company.formeJuridique);
    return form !== null && isPublicLegalForm(form);
  }

  /** Le site sous son nom du moment, son principal lu sous le verrou de sa ligne. */
  async siteOf(companyId: string): Promise<BasketFactSite> {
    const locked = await this.principals.lockedPrincipalOf(companyId);
    const name = (await this.names.nameOf(companyId)) ?? companyId;
    return { companyId, name, principalCompanyId: locked?.principalCompanyId ?? null };
  }
}

/** Le nom d'usage du client, ou son e-mail quand il n'en a pas encore. */
function displayName(user: { firstName: string; lastName: string; email: string }): string {
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name === "" ? user.email : name;
}
