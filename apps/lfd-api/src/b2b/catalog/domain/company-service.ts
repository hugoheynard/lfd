import type { StandingCompanyStatus } from "../../shared/company-standing/domain/company-standing.js";

/**
 * **Comment une société agissante est servie** — LA décision « pro ou pas »
 * (`documentation/comptes-client/plan-pros-en-cours-d-inscription.md`, § 1,
 * § 3, lot P0). Prise ici une fois, sur le statut relu en base à chaque
 * requête ; aucun appelant ne relit le statut.
 *
 * - `pro` : le lecteur pro, la mercuriale et le tarif de canal de la société ;
 * - `public` : le prix d'étiquette, sans rien de négocié ;
 * - `closed` : le catalogue se lit au public, mais rien ne se tarife ni ne se
 *   commande au nom de la société.
 */
export type CompanyService = "pro" | "public" | "closed";

/**
 * La règle, pure.
 *
 * - `active` → pro.
 * - `pending` → pro, **inchangé au lot P0** : la case « traiter en pro les
 *   sociétés en cours d'inscription » vient au lot P1/P3, cochée par défaut.
 * - `suspended` → public : tant que le staff n'a pas choisi le tarif de la
 *   suspension (lot P1), c'est le moins coûteux à se tromper (§ 4, Q9).
 * - `terminated` → fermée (« Ce compte est clos. »).
 * - société inconnue (`null`) → public : rien de négocié sans société lue.
 */
export function companyServiceOf(status: StandingCompanyStatus | null): CompanyService {
  switch (status) {
    case "active":
    case "pending":
      return "pro";
    case "terminated":
      return "closed";
    case "suspended":
    case null:
      return "public";
  }
}
