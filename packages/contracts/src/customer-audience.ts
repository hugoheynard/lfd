import type { CompanyStatus } from "./customer-sheet.js";

/**
 * **La clientèle d'une requête** : les pros (`b2b`) ou les particuliers (`b2c`).
 *
 * Elle règle ce que l'admin ouvre à l'une ou à l'autre — la remise d'un point de
 * retrait, la livraison. Cf. `documentation/livraisons/clientele/plan-remise-et-livraison-par-clientele.md`.
 */
export type CustomerAudience = "b2b" | "b2c";

/**
 * **B2B pour toute société qui n'est pas close** : `active`, `suspended`
 * (Q3, 2026-11-03 — une suspension ne touche qu'au crédit,
 * `documentation/comptes-client/plan-suspendue-au-prix-pro.md` § 5) et
 * `pending` depuis le 2026-11-05 (Hugo : « le seul truc qu'on ne peut pas
 * faire sur un pending, c'est au compte » —
 * `documentation/comptes-client/plan-pros-en-cours-d-inscription.md` § 0).
 *
 * `null` = aucune société agissante : un visiteur, ou l'espace perso → B2C.
 * `terminated` → B2C.
 *
 * L'ancienne raison d'exclure `pending` — « une remise pros seulement ne doit
 * pas s'obtenir en tapant un SIRET » — est levée SCIEMMENT : la validation
 * commerciale fait le tri, le prix des articles était déjà pro pour un pending
 * (`companyServiceOf`), et seul le crédit (« au compte », réservé à `active`)
 * attend cette validation. Une promotion qui veut exclure les pending vise
 * « pros actifs », que le ciblage lit sur le statut, pas ici.
 *
 * Une seule fonction, lue par le serveur (qui décide) et par la boutique (qui
 * n'affiche que ce que le serveur appliquera) : deux définitions de « qui est
 * pro » finiraient par annoncer une remise que la caisse refuse.
 */
export function audienceOf(actingCompanyStatus: CompanyStatus | null): CustomerAudience {
  return actingCompanyStatus === null || actingCompanyStatus === "terminated" ? "b2c" : "b2b";
}
