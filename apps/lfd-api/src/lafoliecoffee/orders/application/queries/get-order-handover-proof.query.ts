/**
 * La preuve de remise à la porte d'une commande, pour le staff qui répond à
 * une contestation (`a-la-porte.md`, § 10, lot « voir les preuves »).
 */
export class GetOrderHandoverProofQuery {
  constructor(readonly orderId: string) {}
}
