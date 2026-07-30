import type { ActivationSupportPayload } from "@lfd/contracts";

/**
 * Demande d'être contacté par l'équipe commerciale pour finir l'activation.
 * `actorUserId` accompagne `companyId` : le mur (membre) se vérifie contre
 * l'acteur, et c'est lui qui est enregistré comme demandeur.
 */
export class RequestActivationSupportCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly payload: ActivationSupportPayload,
  ) {}
}
