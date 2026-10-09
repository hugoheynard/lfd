import type { ContactMessageStatus, ContactMessageView } from "@lfd/contracts";

/** Port de **lecture** des messages, pour la liste du back-office. */
export abstract class ContactMessageReader {
  /** « À traiter » du plus ancien au plus récent ; « traités » du plus récemment traité. Bornée. */
  abstract list(status: ContactMessageStatus, limit: number): Promise<ContactMessageView[]>;
}
