import type { AccountBankExport } from "../entities/account-bank-export.js";
import type { KnownBankAccount } from "../entities/known-bank-account.js";

/** Port d'ÉCRITURE de l'export des comptes : il prend et rend l'agrégat. */
export abstract class AccountBankExportRepository {
  /**
   * L'export, s'il appartient à CETTE entité — `null` sinon. Le mur est dans
   * la requête : un export d'une autre entité n'existe pas pour la route.
   */
  abstract load(legalEntityId: string, exportId: string): Promise<AccountBankExport | null>;
  abstract save(bankExport: AccountBankExport): Promise<void>;
}

/** Port d'ÉCRITURE des déclarations « déjà connu de la banque ». Elles ne changent plus. */
export abstract class KnownBankAccountRepository {
  abstract add(account: KnownBankAccount): Promise<void>;
}
