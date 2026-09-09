import type { SaveMercurialeDraftPayload } from "@lfd/contracts";

/**
 * **Enregistrer le brouillon de mercuriale d'un client** — il se remplace
 * entier, comme la grille qu'il porte.
 *
 * Une écriture, donc une commande : elle ne rend rien, et l'écran relit s'il a
 * besoin de ce qui est désormais enregistré.
 */
export class SaveMercurialeDraftCommand {
  constructor(
    readonly companyId: string,
    readonly payload: SaveMercurialeDraftPayload,
    readonly staffSub: string,
  ) {}
}
