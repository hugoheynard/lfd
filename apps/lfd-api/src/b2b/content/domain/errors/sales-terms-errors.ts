import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **CGV**. Trois familles, trois statuts, et des messages écrits
 * pour quelqu'un qui a l'écran sous les yeux et pas le code : chacun nomme le
 * cas réel et le geste qui en sort.
 */

/**
 * L'article visé n'est plus dans le document — **404**.
 *
 * Le cas courant n'est pas un identifiant forgé, c'est un écran resté ouvert
 * pendant qu'un collègue supprimait l'article : d'où le geste proposé.
 */
export class UnknownSalesTermsParagraphError extends ResourceNotFoundError {
  constructor(readonly paragraphId: string) {
    super(
      "sales_terms.paragraph.unknown",
      `Aucun article « ${paragraphId} » dans les conditions générales de vente : ` +
        "rafraîchissez l'écran, il a pu être supprimé entre-temps.",
    );
  }
}

/**
 * Le rang demandé ne désigne aucune place du document — **400**.
 *
 * La borne haute dépend du document, c'est pourquoi elle ne peut pas vivre dans
 * le schéma du contrat : seul l'agrégat sait combien d'articles il porte.
 */
export class SalesTermsPositionOutOfRangeError extends DomainError {
  constructor(
    readonly position: number,
    readonly count: number,
  ) {
    super(
      "sales_terms.position.out_of_range",
      `Rang ${position} impossible : les conditions générales comptent ${count} article(s), ` +
        `les rangs vont de 0 à ${Math.max(count - 1, 0)}. Rechargez l'écran et refaites le déplacement.`,
    );
  }
}

/**
 * Le document a atteint sa borne — **409**.
 *
 * Ce n'est pas une limite ressentie : un document qui approche la centaine
 * d'articles a un problème de rédaction avant d'avoir un problème de capacité.
 */
export class SalesTermsDocumentFullError extends BusinessError {
  constructor(readonly maximum: number) {
    super(
      "sales_terms.document.full",
      `Les conditions générales portent déjà ${maximum} articles, le maximum : ` +
        "supprimez ou fusionnez un article avant d'en ajouter un autre.",
    );
  }
}

/**
 * Deux articles porteraient le même identifiant — **409**.
 *
 * Impossible par construction tant que l'identifiant vient du port
 * `IdGenerator`, et refusé ici pour que ça le reste : le contrat interdit déjà
 * le doublon à la RELECTURE, ce qui rendrait le document illisible après coup
 * plutôt qu'au moment du geste fautif.
 */
export class DuplicateSalesTermsParagraphError extends BusinessError {
  constructor(readonly paragraphId: string) {
    super(
      "sales_terms.paragraph.duplicate",
      `Un article « ${paragraphId} » existe déjà dans les conditions générales : ` +
        "recommencez l'ajout, l'identifiant est attribué par le serveur.",
    );
  }
}
