/** Une adresse de LIVRAISON vivante, réduite à ce qu'il faut pour la rapprocher des zones. */
export interface DeliveryPostalCode {
  readonly postalCode: string;
  readonly city: string;
  readonly companyId: string;
  /** L'enseigne, ou la raison sociale à défaut — le nom sous lequel le staff connaît le compte. */
  readonly companyName: string;
}

/**
 * **Les codes postaux des adresses de livraison des comptes servis.**
 *
 * Le réglage des zones de livraison demande « quels clients ne pourrait-on pas
 * livrer ? » ; les adresses sont ici, il les lit par ce port (ISP : rien
 * d'autre du carnet). Une adresse archivée et une société résiliée n'en font
 * pas partie : on ne règle pas un tarif pour un compte qu'on ne sert plus.
 */
export abstract class DeliveryPostalCodesReader {
  /** Une entrée par adresse de livraison non archivée d'une société non résiliée. */
  abstract ofServedCompanies(): Promise<readonly DeliveryPostalCode[]>;
}
