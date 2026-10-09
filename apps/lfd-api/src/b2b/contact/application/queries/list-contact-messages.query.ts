import type { ContactMessageStatus } from "@lfd/contracts";

/** Query : les messages « à traiter » ou « traités ». */
export class ListContactMessagesQuery {
  constructor(readonly status: ContactMessageStatus) {}
}
