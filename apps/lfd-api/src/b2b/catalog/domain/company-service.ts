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
 * - `pending` → pro, sans réglage : la case « traiter en pro » des lots
 *   P1/P3 est abandonnée (Hugo, 2026-11-05, `plan-pros-en-cours-d-inscription.md`
 *   § 0 — seul « au compte » attend la validation).
 * - `suspended` → pro, son tarif à elle : une suspension ne touche plus qu'au
 *   crédit (Hugo, 2026-11-03, `plan-suspendue-au-prix-pro.md` § 5 — révise
 *   Q9 du P0, qui disait public ; P1 abandonné pour la suspension).
 * - `terminated` → fermée (« Ce compte est clos. »).
 * - société inconnue (`null`) → public : rien de négocié sans société lue.
 */
export function companyServiceOf(status: StandingCompanyStatus | null): CompanyService {
  switch (status) {
    case "active":
    case "pending":
    case "suspended":
      return "pro";
    case "terminated":
      return "closed";
    case null:
      return "public";
  }
}
