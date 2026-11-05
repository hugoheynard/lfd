import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { UserProfileNotFoundError } from "../../domain/errors/account-errors.js";
import { AccountFeatureLevelsReader } from "../../domain/ports/account-feature-levels.reader.js";
import { AccountReader, type AccountView } from "../../domain/ports/account.reader.js";
import { GetMyAccountQuery } from "./get-my-account.query.js";

/**
 * Lit le compte : profil + entreprises + niveaux de fonctionnalités, en
 * **une** réponse.
 *
 * Un seul aller-retour pour l'amorçage du front, qui a besoin de tout à la fois
 * (l'e-mail dans l'en-tête, le nombre d'entreprises pour décider entre empty
 * state, page simple et onglets, les interrupteurs pour les portes de l'écran).
 * Le compte et les niveaux se lisent EN PARALLÈLE : aucun n'attend l'autre.
 */
@QueryHandler(GetMyAccountQuery)
export class GetMyAccountHandler implements IQueryHandler<GetMyAccountQuery, AccountView> {
  constructor(
    private readonly accounts: AccountReader,
    private readonly featureLevels: AccountFeatureLevelsReader,
  ) {}

  async execute(query: GetMyAccountQuery): Promise<AccountView> {
    const [account, featureLevels] = await Promise.all([
      this.accounts.read(query.userId),
      this.featureLevels.levelsFor(query.subject),
    ]);
    if (account === null) {
      // Le guard a résolu un Principal, donc la personne existait à l'instant :
      // arriver ici signifie une suppression concurrente, pas une requête invalide.
      throw new UserProfileNotFoundError(query.userId);
    }
    return { ...account, featureLevels };
  }
}
