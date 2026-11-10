import type { ShopAudience } from "../../domain/ports/catalog.reader.js";

/**
 * Masque un article pour UNE audience, ou l'y remet — la route unique du
 * masquage (H5 ; §4 de `documentation/catalogue/catalogue-synchronise.md`).
 * Remplace les deux commandes d'avant, une par audience.
 */
export class SetMaskingCommand {
  constructor(
    readonly sku: string,
    readonly audience: ShopAudience,
    readonly hidden: boolean,
    readonly decidedBy: string | null,
  ) {}
}
