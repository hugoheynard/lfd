import type { PriceTemplateKind } from "@lfd/contracts";

/**
 * « Quelles grilles ai-je en réserve de cette nature-là ? »
 *
 * La nature est déjà **reconnue** quand la question se pose : elle est validée en
 * forme à la frontière HTTP, et le cas d'usage n'a pas à revalider ce que le
 * schéma garantit.
 */
export class ListPriceTemplatesQuery {
  constructor(readonly kind: PriceTemplateKind) {}
}
