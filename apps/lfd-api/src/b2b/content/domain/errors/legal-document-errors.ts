import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus d'un **document de mention légale**. Trois familles, trois statuts,
 * et des messages écrits pour quelqu'un qui a l'écran sous les yeux et pas le
 * code : chacun nomme le cas réel et le geste qui en sort.
 *
 * ⚠️ Ils portent le **titre du document**, pas la clé de la mention : le
 * rédacteur qui lit le refus a « Politique de confidentialité » en tête de son
 * écran, pas `privacy`. Le titre vient de l'agrégat lui-même, donc il suit un
 * renommage sans que personne ait à y penser.
 */

/**
 * L'article visé n'est plus dans le document — **404**.
 *
 * Le cas courant n'est pas un identifiant forgé, c'est un écran resté ouvert
 * pendant qu'un collègue supprimait l'article : d'où le geste proposé.
 */
export class UnknownLegalDocumentParagraphError extends ResourceNotFoundError {
  constructor(
    readonly paragraphId: string,
    readonly documentTitle: string,
  ) {
    super(
      "legal_document.paragraph.unknown",
      `Aucun article « ${paragraphId} » dans « ${documentTitle} » : ` +
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
export class LegalDocumentPositionOutOfRangeError extends DomainError {
  constructor(
    readonly position: number,
    readonly count: number,
    readonly documentTitle: string,
  ) {
    super(
      "legal_document.position.out_of_range",
      `Rang ${position} impossible : « ${documentTitle} » compte ${count} article(s), ` +
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
export class LegalDocumentFullError extends BusinessError {
  constructor(
    readonly maximum: number,
    readonly documentTitle: string,
  ) {
    super(
      "legal_document.document.full",
      `« ${documentTitle} » porte déjà ${maximum} articles, le maximum : ` +
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
export class DuplicateLegalDocumentParagraphError extends BusinessError {
  constructor(
    readonly paragraphId: string,
    readonly documentTitle: string,
  ) {
    super(
      "legal_document.paragraph.duplicate",
      `Un article « ${paragraphId} » existe déjà dans « ${documentTitle} » : ` +
        "recommencez l'ajout, l'identifiant est attribué par le serveur.",
    );
  }
}

/**
 * La mention demandée n'est pas du vocabulaire — **404**.
 *
 * 🔴 Le refus est un 404 et non un 400 parce que le segment d'URL désigne une
 * RESSOURCE : « ce document n'existe pas » est ce que le demandeur doit lire.
 * Sans ce refus, une clé libre ouvrirait un bloc de contenu que le pied de page
 * ne peut pas cocher, qu'aucune surface n'affiche, et que personne ne saurait
 * retrouver.
 */
export class UnknownLegalMentionError extends ResourceNotFoundError {
  constructor(
    readonly mention: string,
    readonly known: readonly string[],
  ) {
    super(
      "legal_document.mention.unknown",
      `Aucune mention légale « ${mention} » : les mentions connues sont ` +
        `${known.join(", ")}. Vérifiez l'adresse ou repartez du menu Contenu.`,
    );
  }
}
