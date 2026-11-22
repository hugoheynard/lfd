/**
 * Commande **staff** : supprimer un compte qui n'a jamais commandé
 * (« Supprimer le compte »). Un archivage : rien n'est effacé, le statut ne
 * bouge pas.
 */
export class ArchiveCompanyCommand {
  constructor(
    readonly companyId: string,
    /** Le motif, obligatoire : c'est lui qu'on relit avant de rendre le compte. */
    readonly reason: string,
    /** Qui supprime : la fiche staff, signée sur la ligne de la société. */
    readonly staffUserId: string,
  ) {}
}
