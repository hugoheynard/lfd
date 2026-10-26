/**
 * **Le retrait saisi**, par le numéro de commande — le chemin de secours.
 *
 * Le numéro n'est pas un secret : ce qui protège cette porte est la session
 * staff, dont l'identité est gravée avec l'attestation.
 *
 * `reference` peut nommer un reste (`ORD-…-2`, plan E7 reliquat, L4c) ;
 * `ranks`, les envois cochés, ou `null`.
 */
export class ConfirmManualHandoverCommand {
  constructor(
    readonly reference: string,
    readonly staffUserId: string,
    readonly ranks: readonly number[] | null = null,
  ) {}
}
