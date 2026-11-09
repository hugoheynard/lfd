import type { MailSendSpace } from "@lfd/contracts";

/**
 * Command : **désinscrire une adresse donnée par le client** (plan de
 * désinscription, règle 8, lot C4) — l'adresse voyage dans le CORPS, jamais
 * dans l'URL. Une adresse que le registre ne connaissait pas y entre
 * désinscrite : la question est éteinte pour toujours. Ne rend rien, quelle
 * que soit l'adresse.
 */
export class UnsubscribeAddressByStaffCommand {
  constructor(
    readonly space: MailSendSpace,
    readonly address: string,
  ) {}
}
