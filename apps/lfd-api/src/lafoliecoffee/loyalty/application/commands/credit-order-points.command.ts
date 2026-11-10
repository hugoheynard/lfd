/**
 * Créditer les points d'une commande, si elle est définitive — remise ET
 * encaissée — et qu'elle rapporte quelque chose (plan D3). Rejouable : un
 * second passage n'écrit rien. Rend vrai si ce passage a écrit le gain.
 */
export class CreditOrderPointsCommand {
  constructor(readonly orderId: string) {}
}
