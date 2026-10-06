import type { DeliveryStepFields } from "@lfd/contracts";

/**
 * Un agent ajoute une étape en fin de procédure de livraison d'une adresse ;
 * `photo` = octets reçus, `null` sans photo.
 *
 * Sans acteur : l'auth staff garde la route, et l'agent est figé par le journal
 * au moment du fait. Même geste que celui du gestionnaire, sans le mur
 * membership.
 */
export class AddDeliveryStepByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
    readonly fields: DeliveryStepFields,
    readonly photo: Buffer | null,
  ) {}
}
