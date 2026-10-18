/** « Envoyer un test » : un corps vide et signé, tout de suite. Rend l'id de l'envoi. */
export class SendVitrineTestCommand {
  constructor(readonly subscriberId: string) {}
}
