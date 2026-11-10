import type { ContactMessagePayload } from "@lfd/contracts";

/** Le client connecté qui écrit, et la société pour laquelle il agit. `null` pour un visiteur. */
export interface ContactSender {
  readonly userId: string;
  readonly companyId: string | null;
}

/**
 * Écrire à l'équipe par « Nous écrire » (une demande `contact`). Ne rend rien : un message écarté par
 * le piège rend la même réponse qu'un message reçu.
 *
 * `clientIp` est l'IP TRONQUÉE de l'appelant (`truncateIp`) : elle ne sert
 * qu'à journaliser un piège rempli, jamais à identifier quelqu'un.
 */
export class SendContactMessageCommand {
  constructor(
    readonly payload: ContactMessagePayload,
    readonly sender: ContactSender | null,
    readonly clientIp: string,
  ) {}
}
