import type { DeliveryStepFields } from "@lfd/contracts";

/**
 * Les gestes du **gestionnaire** sur la procédure de livraison d'une adresse de
 * sa société.
 *
 * Regroupés comme `address-commands.ts` : une même intention (« tenir la
 * procédure de cette adresse »), un même acteur, un même mur. Chacune garde son
 * handler. `actorUserId` accompagne `companyId` : c'est contre le rôle de
 * l'acteur dans cette société que le mur se vérifie.
 */

/** Ajoute une étape en fin de procédure ; `photo` = octets reçus, `null` sans photo. */
export class AddDeliveryStepCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly addressId: string,
    readonly fields: DeliveryStepFields,
    readonly photo: Buffer | null,
  ) {}
}

/** Refait une étape : titre, texte, photo gardée / retirée / remplacée. */
export class ReviseDeliveryStepCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly addressId: string,
    readonly stepId: string,
    readonly fields: DeliveryStepFields,
    readonly removePhoto: boolean,
    readonly photo: Buffer | null,
  ) {}
}

/** Supprime définitivement une étape et sa photo. */
export class RemoveDeliveryStepCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly addressId: string,
    readonly stepId: string,
  ) {}
}

/** Range les étapes dans un nouvel ordre — toutes, chacune une fois. */
export class ReorderDeliveryStepsCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly addressId: string,
    readonly stepIds: readonly string[],
  ) {}
}
