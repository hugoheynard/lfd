import type { SavePriceTemplatePayload } from "@lfd/contracts";

/** Composer un gabarit, ou le réviser s'il en porte déjà un identifiant. */
export class SavePriceTemplateCommand {
  constructor(
    readonly id: string | null,
    readonly payload: SavePriceTemplatePayload,
    readonly staffUserId: string,
  ) {}
}
