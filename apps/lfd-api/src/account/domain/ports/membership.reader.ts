import type { CompanyRole } from "../value-objects/company-role.js";

/**
 * Lit le rôle d'une personne dans une entreprise donnée — la source de vérité du
 * mur de tenancy pour une opération ciblée.
 *
 * Requête volontairement distincte de ce que le `Principal` porte déjà : on veut
 * le rôle **relu en base au moment de l'action**, pas un rôle dérivé côté
 * contrôleur d'un jeton qui a pu être révoqué entre-temps.
 */
export abstract class MembershipReader {
  /** Le rôle du couple (personne, entreprise), ou `null` s'il n'existe aucun rattachement. */
  abstract roleOf(userId: string, companyId: string): Promise<CompanyRole | null>;
}
