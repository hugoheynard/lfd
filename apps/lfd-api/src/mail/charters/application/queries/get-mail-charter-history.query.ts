/** Query : les chartes publiées d'un espace, de la plus récente à la plus ancienne. */
export class GetMailCharterHistoryQuery {
  constructor(readonly space: string) {}
}
