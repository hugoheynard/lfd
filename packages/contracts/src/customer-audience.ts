import type { CompanyStatus } from "./customer-sheet.js";

/**
 * **La clientèle d'une requête** : les pros (`b2b`) ou les particuliers (`b2c`).
 *
 * Elle règle ce que l'admin ouvre à l'une ou à l'autre — la remise d'un point de
 * retrait, la livraison. Cf. `documentation/livraisons/clientele/plan-remise-et-livraison-par-clientele.md`.
 */
export type CustomerAudience = "b2b" | "b2c";

/**
 * **B2B pour une société ACTIVE ou SUSPENDUE** (Hugo, 2026-09-15, Q3 du plan ;
 * la suspendue rejoint l'active le 2026-11-03 — une suspension ne touche plus
 * qu'au crédit, `documentation/comptes-client/plan-suspendue-au-prix-pro.md` § 5).
 *
 * `null` = aucune société agissante : un visiteur, ou l'espace perso → B2C.
 * `pending`, `terminated` → B2C aussi : déclarer une société ne demande aucune
 * vérification, et une remise « pros seulement » ne doit pas s'obtenir en
 * tapant un SIRET.
 *
 * Une seule fonction, lue par le serveur (qui décide) et par la boutique (qui
 * n'affiche que ce que le serveur appliquera) : deux définitions de « qui est
 * pro » finiraient par annoncer une remise que la caisse refuse.
 */
export function audienceOf(actingCompanyStatus: CompanyStatus | null): CustomerAudience {
  return actingCompanyStatus === "active" || actingCompanyStatus === "suspended" ? "b2b" : "b2c";
}
