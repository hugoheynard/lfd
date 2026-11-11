/**
 * **La clé d'intention d'un envoi** (pose, avenant, correction de dates) —
 * en-tête `Idempotency-Key`, lu par l'API.
 *
 * Fabriquée à l'ouverture de l'intention (la construction), renvoyée à chaque
 * clic tant que l'envoi est le même : un double clic, ou un réessai après une
 * réponse perdue, ne pose ni n'amende deux fois — l'API rend la réponse
 * d'origine. Neuve après un succès ({@link done}), et neuve dès que la saisie
 * envoyée change de nature : sans quoi l'API rendrait la réponse d'un envoi
 * qui n'est plus celui qu'on voit.
 *
 * Un refus garde la clé : l'API a rendu l'intention, le réessai repasse.
 */
export class SendingIntent {
  private key: string = crypto.randomUUID();
  private sent: string | null = null;

  /** La clé de cet envoi : la même tant que le corps ne change pas. */
  keyFor(body: unknown): string {
    const shape = JSON.stringify(body);
    if (this.sent !== null && this.sent !== shape) {
      this.key = crypto.randomUUID();
    }
    this.sent = shape;
    return this.key;
  }

  /** L'envoi a abouti : le suivant est une intention neuve. */
  done(): void {
    this.key = crypto.randomUUID();
    this.sent = null;
  }
}
