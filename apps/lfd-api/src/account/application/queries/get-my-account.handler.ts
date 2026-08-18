import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { UserProfileNotFoundError } from "../../domain/errors/account-errors.js";
import { AccountReader, type AccountView } from "../../domain/ports/account.reader.js";
import { GetMyAccountQuery } from "./get-my-account.query.js";

/**
 * Lit le compte : profil + entreprises, en **une** réponse.
 *
 * Un seul aller-retour pour l'amorçage du front, qui a besoin des deux à la fois
 * (l'e-mail dans l'en-tête, le nombre d'entreprises pour décider entre empty
 * state, page simple et onglets). Deux endpoints séparés obligeraient chaque
 * écran à les recomposer.
 */
@QueryHandler(GetMyAccountQuery)
export class GetMyAccountHandler implements IQueryHandler<GetMyAccountQuery, AccountView> {
  constructor(private readonly accounts: AccountReader) {}

  async execute(query: GetMyAccountQuery): Promise<AccountView> {
    const account = await this.accounts.read(query.userId);
    if (account === null) {
      // Le guard a résolu un Principal, donc la personne existait à l'instant :
      // arriver ici signifie une suppression concurrente, pas une requête invalide.
      throw new UserProfileNotFoundError(query.userId);
    }
    return account;
  }
}
