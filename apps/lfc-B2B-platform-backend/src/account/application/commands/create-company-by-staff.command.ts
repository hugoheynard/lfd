import type { ContactDetailsInput } from "../../domain/value-objects/contact-details.js";

/**
 * Crée un compte client **depuis l'admin** (Porte B de l'onboarding — « le
 * commercial provisionne »). À la différence de `CreateCompanyCommand`, il n'y a
 * **pas** d'`ownerUserId` : le staff n'est pas le client. Le contact principal
 * est **saisi** (pas dérivé d'un profil), donc porté par la commande.
 */
export class CreateCompanyByStaffCommand {
  constructor(
    readonly raisonSociale: string,
    readonly enseigne: string,
    readonly formeJuridique: string,
    readonly siret: string,
    readonly tvaIntracom: string,
    readonly contact: ContactDetailsInput,
  ) {}
}
