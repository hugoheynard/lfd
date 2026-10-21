import type { OrderView } from "@lfd/contracts";

/** Ce que la liste lit : qui demande, quelle société, et le filtre de site. */
export interface CompanyOrderListScope {
  readonly actorUserId: string;
  readonly companyId: string;
  /** Une seule société du périmètre, ou `null` : tout le périmètre. */
  readonly site: string | null;
}

/** Une commande de la liste, avec son site et son auteur. */
export interface CompanyOrderEntry {
  readonly view: OrderView;
  /** `null` : la commande est celle de la société listée. */
  readonly site: { readonly companyId: string; readonly name: string } | null;
  /** `team` : saisie par l'équipe ; sinon le nom du client qui l'a passée. */
  readonly author: { readonly kind: "team" } | { readonly kind: "customer"; readonly name: string };
}

/**
 * Port de **lecture** de « Mes commandes » d'une société, ses sites compris
 * (plan `documentation/comptes-client/plan-commandes-des-sites.md`, lot C1,
 * §2, §7.5).
 *
 * 🔴 Le mur est DANS la requête de l'adaptateur, jamais filtré après coup :
 * les commandes de la société, et celles de ses sites ACTUELS (parent relu à
 * chaque appel — détacher coupe) si — et seulement si — le demandeur est
 * `owner`/`admin` ACCEPTÉ de la société listée et qu'elle est `active` (la
 * règle d'`effectiveRole`). Le rattachement à la société listée elle-même est
 * vérifié AVANT par l'appelant (`OrderGuardReader.roleOf`).
 */
export abstract class CompanyOrderListReader {
  /** La plus récente en tête. */
  abstract listFor(scope: CompanyOrderListScope): Promise<readonly CompanyOrderEntry[]>;
}
