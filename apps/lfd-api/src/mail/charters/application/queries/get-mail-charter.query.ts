/** Query : la charte d'un espace, telle que la page « Charte » l'ouvre. Rien n'est écrit. */
export class GetMailCharterQuery {
  constructor(readonly space: string) {}
}
