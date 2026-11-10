/** « Renvoyer » un envoi parti ou en échec. */
export class ResendVitrineDeliveryCommand {
  constructor(readonly deliveryId: string) {}
}
