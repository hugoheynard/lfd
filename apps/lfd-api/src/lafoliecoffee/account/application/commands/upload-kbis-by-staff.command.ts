/**
 * Dépose le KBIS d'une société (le fichier vit dans le stockage objet).
 *
 * Commande **staff** (Porte B) : le commercial complète une société **à la
 * place** du client. Contrairement aux commandes client (`actorUserId → roleOf →
 * ensureCompanyAdmin`), elle ne porte **pas d'acteur** et **ne franchit aucun
 * mur membership** — le staff n'est membre d'aucune société. L'autorisation est
 * portée **en amont** par `AdminAuthGuard` sur la route `admin/*`. Même patron
 * que `CreateCompanyByStaffCommand`, appliqué aux pièces d'activation.
 */
export class UploadKbisByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly fileName: string,
    readonly bytes: Buffer,
    /** La fiche du staff qui agit : l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
