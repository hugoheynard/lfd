/**
 * **La remise saisie**, par le numéro de commande — le chemin de secours.
 *
 * Le numéro n'est pas un secret : ce qui protège cette porte est la session
 * staff, dont l'identité est gravée avec l'attestation.
 */
export class ConfirmManualHandoverCommand {
  constructor(
    readonly reference: string,
    readonly staffSubject: string,
  ) {}
}
