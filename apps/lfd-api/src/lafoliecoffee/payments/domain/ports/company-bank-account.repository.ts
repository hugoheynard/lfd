import type { CompanyBankAccount } from "../entities/company-bank-account.js";

/**
 * Port de persistance du **RIB d'un client**.
 *
 * Une lecture, une écriture. Pas de `findAll`, et ce n'est pas une économie :
 * une méthode qui rendrait la liste des comptes bancaires de tous les clients
 * est exactement la requête qu'on ne veut pas rendre facile. Le jour où un écran
 * en aurait besoin, il faudra dire lequel et pourquoi.
 *
 * 🔴 Le port prend et rend l'**agrégat**, jamais des primitives. Une
 * `setIban(companyId, iban)` ferait du dépôt un CRUD et laisserait la règle du
 * changement de compte dans un handler — c'est-à-dire invisible au prochain qui
 * touche au même sujet.
 *
 * ⚠️ Il vit dans `domain/ports/` et non à plat dans `domain/` comme
 * `payment-mandate.repository.ts` : c'est la convention du `CLAUDE.md` §3, que
 * `accounting` suit déjà. Les ports à plat de ce contexte sont antérieurs.
 */
export abstract class CompanyBankAccountRepository {
  /** Le RIB d'une société, ou `null` si elle n'en a jamais déposé. */
  abstract findByCompany(companyId: string): Promise<CompanyBankAccount | null>;

  /**
   * Écrit le RIB — création ou remplacement, selon qu'il en existait un.
   *
   * `company_id` porte l'index unique : c'est lui qui garantit qu'un client a
   * un RIB et pas une collection, y compris sous deux requêtes simultanées.
   */
  abstract save(account: CompanyBankAccount): Promise<void>;
}
