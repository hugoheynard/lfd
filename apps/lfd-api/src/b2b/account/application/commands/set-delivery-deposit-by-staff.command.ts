/**
 * Autorise — ou retire — le **dépôt sans personne** sur une adresse de
 * livraison, **à la place du client** (`documentation/livraisons/livreur/a-la-porte.md`,
 * AP-Q1, AP-D5).
 *
 * Une commande à part, et une route à part sous `delivery_procedures` (le
 * commercial, comme la procédure) : l'édition de l'adresse par le staff reste
 * sous `b2b_companies` et ne touche pas ce réglage. Aucun mur membership — le
 * staff n'est membre d'aucune société ; le mur qui reste est le rattachement
 * de l'adresse à la société, tenu par le carnet.
 */
export class SetDeliveryDepositByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
    readonly depositAllowed: boolean,
  ) {}
}
