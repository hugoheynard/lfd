import type { DeliveryStepFields } from "@lfd/contracts";

/**
 * Les gestes d'un **agent** sur la procédure de livraison d'un client.
 *
 * Sans acteur dans la commande : l'auth staff garde la route, et l'agent est
 * figé par le journal au moment du fait. Mêmes gestes que le gestionnaire.
 */

export class AddDeliveryStepByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
    readonly fields: DeliveryStepFields,
    readonly photo: Buffer | null,
  ) {}
}

export class ReviseDeliveryStepByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
    readonly stepId: string,
    readonly fields: DeliveryStepFields,
    readonly removePhoto: boolean,
    readonly photo: Buffer | null,
  ) {}
}

export class RemoveDeliveryStepByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
    readonly stepId: string,
  ) {}
}

export class ReorderDeliveryStepsByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
    readonly stepIds: readonly string[],
  ) {}
}
