import type { CorrectMercurialeWindowPayload } from "@lfd/contracts";

/** Corriger les dates d'une mercuriale qui n'a pas commencé. */
export class CorrectMercurialeWindowCommand {
  constructor(
    readonly companyId: string,
    readonly mercurialeId: string,
    readonly payload: CorrectMercurialeWindowPayload,
    readonly staffUserId: string,
  ) {}
}
