import type { ContactDetailsInput } from "../../domain/value-objects/contact-details.js";

/**
 * Crée un compte client **depuis l'admin** (Porte B de l'onboarding — « le
 * commercial provisionne »).
 *
 * Pas d'`ownerUserId` à l'entrée, contrairement à `CreateCompanyCommand` : le
 * staff n'est pas le client, et le détenteur est **saisi**, pas dérivé d'un
 * profil connecté. Ce `contact` **est** le détenteur — celui qu'on rappelle est
 * celui qui commande. Il peut déjà avoir un compte chez nous ; c'est au handler
 * de s'en apercevoir, pas au commercial de le savoir d'avance.
 *
 * `invitedBy` est le `sub` du staff : une **trace**, pas une autorisation (la
 * porte est le guard).
 */
export class CreateCompanyByStaffCommand {
  constructor(
    readonly raisonSociale: string,
    readonly enseigne: string,
    readonly formeJuridique: string,
    readonly siret: string,
    readonly tvaIntracom: string,
    readonly contact: ContactDetailsInput,
    readonly invitedBy: string,
  ) {}
}
