import type { CompanyStanding } from "../../../shared/company-standing/domain/company-standing.js";

/**
 * La place d'une personne dans un sous-compte, lue pour juger si elle en
 * règle la carte (`canSetMenuOf`, plan `carte-des-sites.md`, § 3.2). Un
 * port à part : le rôle effectif de `MembershipReader` confond le
 * propre et l'hérité, et la carte ne lit QUE l'hérité.
 */
export abstract class SubAccountMenuAccessReader {
  /** La place lue par la requête partagée, ou `null` : ni propre ni héritée. */
  abstract standingOf(userId: string, companyId: string): Promise<CompanyStanding | null>;
}
