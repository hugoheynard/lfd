/**
 * **Le principal d'une société, relu en base** — le fait dont dépend le public
 * « une société et ses sites » (plan des promotions, § 13.3, lot L10) : un
 * site est admis quand son principal est la société nommée.
 *
 * Un port distinct du statut (ISP) : la plupart des questions demandent l'un
 * sans l'autre, et chacun n'est lu que si une promotion candidate le demande.
 */
export abstract class PromotionPrincipalReader {
  /** La société dont celle-ci est un site ; `null` = aucune (ou société inconnue). */
  abstract principalOf(companyId: string): Promise<string | null>;
}
