import { companyStatusSchema, type CompanyStatus } from "@lfd/contracts";

/**
 * L'état d'un compte relu de la base. Colonne enum côté Postgres, mais on
 * **renarrow** par le schéma du contrat plutôt que de caster : le jour où l'enum
 * SQL gagne une valeur que le contrat ignore, on veut une valeur de repli, pas
 * un type qui ment jusqu'au front.
 */
export function companyStatusOf(value: string): CompanyStatus {
  const parsed = companyStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : "pending";
}
