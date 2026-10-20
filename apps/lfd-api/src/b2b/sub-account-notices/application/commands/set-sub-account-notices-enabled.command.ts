/** Commande **staff** : activer ou couper tous les avis d'un principal. */
export class SetSubAccountNoticesEnabledCommand {
  constructor(
    readonly principalId: string,
    readonly enabled: boolean,
    /** L'id de fiche du staff — « qui a coupé ces avis ? ». */
    readonly staffId: string,
  ) {}
}
