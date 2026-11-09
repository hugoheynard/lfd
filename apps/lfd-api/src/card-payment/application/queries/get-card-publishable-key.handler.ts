import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { GetCardPublishableKeyQuery } from "../../channels/requests/get-card-publishable-key.query.js";
import { CardAccountChoice } from "../card-account-choice.js";

/**
 * La clé publique du compte qui encaisse ce type de sujet (plan M2, §4.2) —
 * lue sur le prestataire du compte, jamais dans une colonne.
 */
@QueryHandler(GetCardPublishableKeyQuery)
export class GetCardPublishableKeyHandler implements IQueryHandler<
  GetCardPublishableKeyQuery,
  string
> {
  constructor(private readonly choice: CardAccountChoice) {}

  /** Un refus de configuration part en promesse rejetée, jamais en exception synchrone. */
  execute(query: GetCardPublishableKeyQuery): Promise<string> {
    return new Promise((resolve) => {
      resolve(this.choice.forSubjectType(query.subjectType).provider.publishableKey());
    });
  }
}
