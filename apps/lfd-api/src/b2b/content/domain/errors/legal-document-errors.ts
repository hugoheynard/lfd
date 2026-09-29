import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
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

/**
 * On supprimerait une **section requise** — **409**.
 *
 * Plan `legal/plan-page-confidentialite.md` §4.2 : Meta pointe l'ancre de cette
 * section. La supprimer tuerait le lien donné sans que rien ne le dise ; on en
 * corrige le texte, on la déplace, on ne la retire pas.
 */
export class RequiredLegalSectionRemovalError extends BusinessError {
  constructor(
    readonly paragraphId: string,
    readonly documentTitle: string,
  ) {
    super(
      "legal_document.section.required",
      `Cette section est exigée par « ${documentTitle} » : modifiez son texte, elle ne se supprime pas.`,
    );
  }
}

/**
 * La section demandée n'est pas exigée par ce document — **400**.
 *
 * Le vocabulaire des sections est fermé, et chaque mention dit lesquelles elle
 * exige : poser une section qu'elle n'exige pas créerait un paragraphe
 * insupprimable sans raison.
 */
export class LegalSectionNotRequiredError extends DomainError {
  constructor(
    readonly section: string,
    readonly documentTitle: string,
  ) {
    super(
      "legal_document.section.not_required",
      `« ${documentTitle} » n'exige pas de section « ${section} » : ` +
        "ajoutez plutôt un article ordinaire.",
    );
  }
}

/**
 * La section requise existe déjà — **409**.
 *
 * Deux paragraphes de même clé porteraient deux fois la même ancre publique,
 * et le lien donné à Meta mènerait au premier au hasard de l'ordre.
 */
export class LegalSectionAlreadyPresentError extends BusinessError {
  constructor(
    readonly section: string,
    readonly documentTitle: string,
  ) {
    super(
      "legal_document.section.already_present",
      `« ${documentTitle} » porte déjà sa section « ${section} » : ` +
        "rechargez l'écran et modifiez son texte plutôt que d'en créer une seconde.",
    );
  }
}

/**
 * Le document a changé depuis que l'écran l'a lu — **409** (§4.5, B2).
 *
 * Le document est UNE ligne réécrite en entière : écrire par-dessus la
 * révision d'un collègue effacerait son geste en silence — une section requise
 * créée entre-temps, par exemple.
 */
export class LegalDocumentChangedError extends BusinessError {
  constructor(
    readonly expectedRevision: number,
    readonly documentTitle: string,
  ) {
    super(
      "legal_document.revision.stale",
      `Quelqu'un a modifié « ${documentTitle} » pendant que vous l'aviez ouvert : rechargez-le.`,
    );
  }
}

/**
 * Le contenu stocké ne se relit plus, et on voulait ÉCRIRE — **500** (§4.5, B3).
 *
 * La lecture publique retombe sur le document de départ pour ne jamais rendre
 * une page cassée. L'écriture, elle, ne le peut pas : partir de ce repli
 * réécrirait le document de production VIDE. On refuse, rien n'est écrit.
 */
export class UnreadableLegalDocumentError extends TechnicalError {
  constructor(
    readonly storageKey: string,
    readonly details: string,
  ) {
    super(
      "legal_document.content.unreadable",
      `Le document « ${storageKey} » ne se relit plus en base : aucune modification n'a été ` +
        "enregistrée, pour ne pas l'écraser. Prévenez l'équipe technique avant toute nouvelle saisie.",
      details,
    );
  }
}
