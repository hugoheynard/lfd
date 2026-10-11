import type { StorefrontFocal } from "../domain/storefront-image.js";

/**
 * Recadre une image de la médiathèque partout où la vitrine la montre (cf.
 * `documentation/mediatheque/mediatheque.md` §7 bis, 2026-10-11).
 *
 * Envoyée par la racine de composition quand la médiathèque redécrit l'image
 * (`media.asset_described`) : la vitrine ne lit pas la médiathèque, elle
 * reçoit le point déjà lu. `focal: null` — personne ne s'est prononcé : retour
 * au centre.
 */
export class RefocusStorefrontImageCommand {
  constructor(
    readonly url: string,
    readonly focal: StorefrontFocal | null,
  ) {}
}
