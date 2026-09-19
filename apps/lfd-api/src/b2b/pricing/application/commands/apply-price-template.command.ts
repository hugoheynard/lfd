import type { ApplyPriceTemplatePayload } from "@lfd/contracts";

/** **Poser** un gabarit chez un client : il devient des règles de mercuriale. */
export class ApplyPriceTemplateCommand {
  constructor(
    readonly id: string,
    readonly payload: ApplyPriceTemplatePayload,
    readonly staffUserId: string,
  ) {}
}
