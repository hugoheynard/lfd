import type { ActivationSupportPayload } from "@lfd/contracts";

/**
 * Demande d'être contacté par l'équipe commerciale.
 *
 * La société est **dans le payload** et peut valoir `null` : c'est le client qui
 * dit sur quoi porte sa demande, et un prospect sans entreprise déclarée doit
 * pouvoir en déposer une. `actorUserId` reste l'acteur — c'est contre lui que le
 * mur se vérifie quand une société est désignée, et c'est lui qu'on enregistre
 * comme demandeur.
 */
export class RequestActivationSupportCommand {
  constructor(
    readonly actorUserId: string,
    readonly payload: ActivationSupportPayload,
  ) {}
}
