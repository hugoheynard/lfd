/**
 * **Le plafond des comptes ouverts au comptoir** (`counterAccountCeilingCents`,
 * `plan-comptes-du-comptoir.md`, § 3.3) : en centimes TTC, ou `null` — aucun
 * plafond, la valeur par défaut.
 */
export abstract class CounterAccountCeilingReader {
  abstract ceilingCents(): Promise<number | null>;
}
