import type { SetMandateOptionsPayload } from "@lfd/contracts";

/**
 * Le **client** règle les zones 14 et 19 de son mandat, depuis `/mon-compte`
 * (décidé par Hugo le 2026-09-14, plan mandat client §10).
 *
 * Une commande à part de `SetMandateOptionsCommand` : celle-ci porte un
 * **demandeur**, et c'est lui qui décide du mur. Le payload est celui du staff.
 */
export class SetMyCompanyMandateOptionsCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly payload: SetMandateOptionsPayload,
  ) {}
}
