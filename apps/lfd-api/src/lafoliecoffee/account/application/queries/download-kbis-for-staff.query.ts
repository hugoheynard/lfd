/**
 * Télécharge le KBIS **côté staff** (Porte B), sans mur membership.
 *
 * Requête distincte de {@link DownloadKbisQuery} plutôt qu'un drapeau
 * `isStaff` : ce sont deux autorisations différentes — l'une repose sur
 * l'appartenance à la société, l'autre sur l'authentification staff — et les
 * fondre laisserait un booléen décider d'un mur.
 */
export class DownloadKbisForStaffQuery {
  constructor(readonly companyId: string) {}
}
