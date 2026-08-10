/**
 * Atteste la **remise en main propre** d'une commande retirée au comptoir.
 *
 * `staffSubject` n'est pas un paramètre d'agrément : c'est la moitié de la
 * preuve. Le jeton dit *quelle commande*, la session dit *qui atteste* — les
 * deux sont écrits ensemble ou pas du tout.
 */
export class ConfirmHandoverCommand {
  constructor(
    readonly token: string,
    readonly staffSubject: string,
  ) {}
}
