/** « Tout renvoyer » : lever l'échec et tout renvoyer au prochain balayage. */
export class ResyncVitrineSubscriberCommand {
  constructor(readonly subscriberId: string) {}
}
