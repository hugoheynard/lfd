/**
 * **« Avertir le client »** — depuis la Supervision, quand la fin du créneau
 * de retrait est passée et que la commande n'est pas prête (Hugo,
 * 2026-10-25). Une fois par commande, passé le délai réglé après la fin du
 * créneau.
 *
 * `staffUserId` est l'id de la FICHE, reçu de la porte — jamais du corps.
 */
export class WarnCustomerOfDelayCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
  ) {}
}
