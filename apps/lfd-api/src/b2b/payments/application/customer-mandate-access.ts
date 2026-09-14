import { CustomerMandateClosedError } from "../domain/errors/mandate-errors.js";
import type { BankAccountGuardReader } from "../domain/ports/bank-account-guard.reader.js";
import type { CustomerMandateGate } from "../domain/ports/customer-mandate-gate.js";
import { ensureBankAccountAccess } from "../domain/services/bank-account-access.js";

/** Les deux lectures qu'ouvre une route client du mandat, et rien d'autre. */
export interface CustomerMandateAccessDeps {
  readonly guard: BankAccountGuardReader;
  readonly gate: CustomerMandateGate;
}

/**
 * Le **seuil commun** des gestes client sur le mandat : le mur, puis le drapeau.
 *
 * L'ordre est la règle (plan `documentation/b2b/plan-mandat-client.md`, fin du
 * §9) : non-membre **404** → rôle **403** → drapeau fermé **409** → règle
 * métier. Lire le drapeau d'abord dirait à un curieux « fermé » sur une société
 * qui n'est pas la sienne — donc qu'elle existe.
 *
 * Même mur que le RIB, par le même port : le mandat autorise à débiter le
 * compte que ces deux rôles gèrent.
 *
 * @throws {BankAccountCompanyNotFoundError} le demandeur n'est pas membre.
 * @throws {BankAccountRoleRequiredError} membre, ni détenteur ni facturation.
 * @throws {CustomerMandateClosedError} le mandat en ligne est fermé.
 */
export async function ensureCustomerMandateAccess(
  deps: CustomerMandateAccessDeps,
  actorUserId: string,
  companyId: string,
): Promise<void> {
  ensureBankAccountAccess(await deps.guard.roleOf(actorUserId, companyId), companyId);
  if (!(await deps.gate.isOpen())) {
    throw new CustomerMandateClosedError();
  }
}
