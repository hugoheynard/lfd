import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import type { LocalizedText } from "../value-objects/alt-text.js";
import type { FocalPoint } from "../value-objects/image.js";

/** Ce qu'on décide d'une image, par opposition à ce qu'on en a mesuré. */
export interface MediaDetails {
  /** L'étiquette de bibliothèque ; `''` = personne ne l'a nommée. */
  readonly name: string;
  /** Normalisés par le domaine avant d'arriver ici. */
  readonly tags: readonly string[];
  /**
   * Le texte alternatif, dans les langues où il est écrit.
   *
   * 🔴 Il vit ICI depuis le 2026-09-23, et nulle part ailleurs. Il se saisissait
   * depuis la fiche produit, et arrivait dans la bibliothèque parce que chaque
   * enregistrement y recréait une ligne. Une image, une description — corriger
   * une faute se fait une fois.
   */
  readonly alt: LocalizedText;
  /** `null` = personne ne s'est prononcé, jamais « au centre ». */
  readonly focal: FocalPoint | null;
  /** La série de l'image — `null` = aucune. Déjà vérifiée par l'appelant. */
  readonly seriesId: string | null;
}

/**
 * L'ÉCRITURE des décisions portées par une image.
 *
 * Port distinct de la lecture (`MediaLibraryReader`) et du dépôt
 * (`MediaLibrary`) : un consommateur ne dépend que de ce qu'il appelle.
 * L'écran de la médiathèque nomme et tague ; il ne ramasse pas d'orphelins.
 *
 * ## Pourquoi pas d'agrégat `load` → `save`
 *
 * `CLAUDE.md` §3.1 pose la question de tri : « existe-t-il une règle qui peut
 * refuser cette écriture ? ». Pour la description d'une image, non — vérifié
 * le 2026-10-11 en relisant son seul appelant, `SaveMediaDetailsHandler` :
 *
 * - ce qu'on refuse est de la FORME, et les value-objects le tiennent avant
 *   d'arriver ici (`mediaTags`, `focalPoint`, `imageAlt`) ;
 * - l'image n'a ni état ni transition : nommer, taguer, pointer valent à tout
 *   moment de sa vie, et aucun ne dépend d'un autre champ ou de l'état d'avant ;
 * - ce qui dépend d'AILLEURS — la série existe-t-elle, un porteur l'affiche-t-il
 *   encore — appartient à un autre agrégat ou à un autre bloc, et un agrégat
 *   « image » ne le garantirait pas mieux que le handler.
 *
 * Un agrégat ici serait de la cérémonie. Le jour où une règle d'état
 * apparaît (une image « validée » qu'on ne retague plus, par exemple), ce port
 * devient `load`/`save`.
 */
export abstract class MediaLibraryWriter {
  /*
   * 🔴 Les deux méthodes exigent un `WriteTicket`, qu'on ne peut obtenir qu'en
   * traçant ou en dérogeant explicitement. Écrire sans avoir rien affirmé
   * devient donc **inexprimable**, et non pas interdit par une relecture : la
   * même mécanique que les ports d'écriture du reste du référentiel.
   */
  /**
   * Écrit ce qu'on a décidé de CETTE image, en remplaçant toutes ses décisions.
   *
   * Clé = l'URL : elle est unique depuis le 2026-09-23 (une image, une ligne),
   * et c'est l'identité que les porteurs citent.
   *
   * @returns `false` si aucune inscription ne porte cette URL — l'image a
   *   disparu entre la lecture et l'écriture.
   */
  abstract describe(url: string, details: MediaDetails, ticket: WriteTicket): Promise<boolean>;

  /**
   * Oublie l'inscription portant cette URL.
   *
   * Par l'URL et non par la clé de stockage : les deux sont équivalentes pour
   * ce qu'on héberge — la clé est le hachage du contenu et l'URL en dérive —
   * mais l'URL couvre AUSSI les visuels saisis à la main, qui n'ont pas de clé.
   * Une seule notion d'identité, celle qui vaut partout.
   *
   * ⚠️ Appelé **après** la suppression de l'objet, jamais avant : l'ordre
   * inverse perdrait la seule trace de ce qu'il reste à supprimer, et l'octet
   * resterait dans le bucket sans que rien ne puisse le désigner.
   *
   * @returns le nombre de lignes oubliées.
   */
  abstract discard(url: string, ticket: WriteTicket): Promise<number>;
}
