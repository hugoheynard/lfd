/**
 * Dépose (ou remplace) le KBIS d'une entreprise.
 *
 * Porte les **octets bruts** du fichier : la validation (PDF, taille) est un
 * invariant du domaine (`KbisFile`), pas de la frontière — le handler la fait,
 * pas le contrôleur. `actorUserId` sert au mur (seul le gestionnaire dépose).
 */
export class UploadKbisCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly fileName: string,
    readonly bytes: Buffer,
  ) {}
}
