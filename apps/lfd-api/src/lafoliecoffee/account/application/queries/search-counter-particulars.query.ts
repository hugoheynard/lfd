/**
 * Query **staff** (saisie particulier au comptoir) : les particuliers qui
 * répondent à une saisie — téléphone, prénom ou adresse.
 */
export class SearchCounterParticularsQuery {
  constructor(readonly text: string) {}
}
