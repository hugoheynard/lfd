import type { ContactPhonePayload } from "@lfd/contracts";

/** Remplacer le réglage entier d'un numéro de contact. */
export class ReviseContactPhoneCommand {
  constructor(
    readonly phoneId: string,
    readonly payload: ContactPhonePayload,
  ) {}
}
