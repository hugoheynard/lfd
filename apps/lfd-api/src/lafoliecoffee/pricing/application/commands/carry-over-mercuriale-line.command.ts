/**
 * Reporter sur `toSku` — née d'un détachement de `fromSku` — le prix que
 * `fromSku` porte dans la mercuriale `mercurialeId`
 * (`documentation/pricing/mercuriales/l-avenant-date.md`, § 6 — le geste L7c).
 */
export class CarryOverMercurialeLineCommand {
  constructor(
    readonly mercurialeId: string,
    readonly fromSku: string,
    readonly toSku: string,
    readonly reason: string,
    readonly staffUserId: string,
  ) {}
}
