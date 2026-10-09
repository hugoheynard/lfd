import type { ContactMessagePayload } from "@lfd/contracts";

/** Le client connecté qui écrit, et la société pour laquelle il agit. `null` pour un visiteur. */
export interface ContactSender {
  readonly userId: string;
  readonly companyId: string | null;
}

/**
 * Écrire à l'équipe par « Nous écrire ». Ne rend rien : un message écarté par
 * le piège rend la même réponse qu'un message reçu.
 */
export class SendContactMessageCommand {
  constructor(
    readonly payload: ContactMessagePayload,
    readonly sender: ContactSender | null,
  ) {}
}
