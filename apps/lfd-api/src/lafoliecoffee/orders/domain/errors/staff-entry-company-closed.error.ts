import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * La saisie de l'équipe vise une société **terminée** : on ne peut plus
 * commander pour elle. Le refus du client (`CompanyClosedOrderRefusedError`)
 * l'envoie vers son espace personnel, geste qui n'existe pas pour le staff ;
 * et la résiliation est terminale (`Company.terminate`).
 */
export class StaffEntryCompanyClosedError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "orders.staff_entry.company_closed",
      "Ce compte est résilié : on ne peut plus commander pour lui, et une résiliation ne se défait pas. Pour reprendre la relation, ouvrez un nouveau compte client.",
    );
  }
}
