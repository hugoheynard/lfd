import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Une société terminée ne commande plus à son nom**
 * (`documentation/comptes-client/plan-pros-en-cours-d-inscription.md`, § 1,
 * lot P0). Levée par le chemin qui facture — devis et passation, client comme
 * saisie staff. La personne commande toujours en particulier, depuis son
 * espace perso.
 */
export class CompanyClosedOrderRefusedError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "catalog.company_closed",
      "Ce compte est clos. Contactez-nous. Vous pouvez toujours commander en particulier depuis votre espace personnel.",
    );
  }
}
