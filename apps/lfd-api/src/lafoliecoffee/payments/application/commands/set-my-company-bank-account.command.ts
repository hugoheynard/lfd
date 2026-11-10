import type { SetCompanyBankAccountPayload } from "@lfd/contracts";

/**
 * Le **client** pose — ou remplace — le RIB de sa société, depuis `/mon-compte`.
 *
 * Une commande à part de `SetCompanyBankAccountCommand`, et pas un drapeau sur
 * elle : celle-ci porte un **demandeur**, et c'est lui qui décide du mur. Le
 * payload, lui, est le même que côté staff — aucune règle neuve.
 */
export class SetMyCompanyBankAccountCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly payload: SetCompanyBankAccountPayload,
  ) {}
}
