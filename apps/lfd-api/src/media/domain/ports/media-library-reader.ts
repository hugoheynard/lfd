import type { LocalizedText } from "../value-objects/alt-text.js";
import type { LibraryPosition, LibrarySort } from "../value-objects/library-order.js";

/**
 * Une image de la bibliothèque.
 *
 * 🔴 Il n'y a pas d'identifiant de ligne ici, et ce n'est pas un oubli :
 * l'identité est l'URL, adressée par contenu (`products/{sha256}.{ext}`), et
 * c'est elle que tous les porteurs citent. `media_asset.url` est unique depuis
 * le 2026-09-23 ; avant, un enregistrement de fiche recréait une ligne par
 * visuel, et seul l'URL traversait deux sauvegardes.
 */
export interface LibraryMediaRecord {
  /** L'identité. Voir ci-dessus : ce n'est pas un raccourci. */
  readonly url: string;
  /** L'étiquette de la bibliothèque ; `''` = personne ne l'a nommée. */
  readonly name: string;
  /** Les mots par lesquels on la retrouve. Normalisés à l'écriture. */
  readonly tags: readonly string[];
  /** Le texte alternatif — une image, une description. */
  readonly alt: LocalizedText;
  readonly storageKey: string | null;
  readonly contentType: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
  /** Le point gardé au centre quand le cadre n'a pas la forme de l'image. */
  readonly focal: { readonly x: number; readonly y: number } | null;
  /**
   * Combien de porteurs l'affichent, tous porteurs confondus.
   *
   * 🔴 C'est ce compte qui permet à l'écran de DIRE « cette image sert dans
   * trois fiches » avant de proposer de la supprimer. Aucune clé étrangère ne
   * traverse depuis que le fonds a son schéma (2026-09-23) : ce compte, rejoué
   * par `DiscardMediaHandler`, est le seul gardien de la règle.
   */
  readonly uses: number;
  /** L'entrée de ces octets dans la bibliothèque. */
  readonly depositedAt: Date;
}

/**
 * **Ce qu'on cherche dans le fonds** — la page, et ce qui la restreint.
 *
 * 🔴 Deux critères et pas un, parce qu'ils n'ont pas la même nature. Le
 * **texte** cherche ce que quelqu'un a écrit (une étiquette) ; les **mots-clés**
 * filtrent sur un vocabulaire posé. Les confondre dans une seule barre ferait
 * une recherche floue sur des valeurs exactes — et l'index GIN des tags, qui
 * sert `hasEvery` sur des valeurs entières, ne servirait plus à rien.
 */
export interface LibraryQuery {
  readonly limit: number;
  /**
   * Le décalage de l'écran qui ne lit pas encore `next` (plan L2). Ignoré dès
   * que {@link after} est donné, et servi pour l'ordre `deposited` seul.
   */
  readonly offset: number;
  /** L'ordre de lecture ; l'URL départage toujours. */
  readonly sort: LibrarySort;
  /** Lire ce qui vient STRICTEMENT après cette position (curseur relu). */
  readonly after?: LibraryPosition | undefined;
  /** Déposée à cet instant ou après. */
  readonly depositedFrom?: Date | undefined;
  /** Déposée strictement avant cet instant. */
  readonly depositedBefore?: Date | undefined;
  /** Seulement les images sans aucun mot-clé. */
  readonly untagged?: boolean | undefined;
  /**
   * Seulement les images qu'aucun porteur n'affiche.
   *
   * ⚠️ Ne se pose pas en base : les emplois viennent des porteurs, par le
   * canal. L'adaptateur lit tout le fonds filtré et classe en mémoire — borné.
   */
  readonly unused?: boolean | undefined;
  /**
   * Cherché dans l'ÉTIQUETTE, en sous-chaîne et sans tenir compte de la casse.
   *
   * ⚠️ Pas dans le nom de fichier : personne ne se souvient de `a3f9….png`, et
   * c'est précisément pour ça que les étiquettes et les tags existent.
   *
   * ⚠️ Et pas de préfixe : l'écran filtrait déjà par SOUS-CHAÎNE côté
   * navigateur. Remonter la recherche au serveur ne doit pas rétrécir ce
   * qu'elle trouvait — un utilisateur qui tape « croissant » et perd
   * « mini-croissant » conclut que la recherche est cassée, pas qu'elle a
   * changé de règle.
   */
  readonly q?: string | undefined;
  /**
   * Les mots-clés que l'image doit porter — **TOUS**, pas au moins un.
   *
   * Cocher un second tag doit RESTREINDRE : c'est le geste que fait quelqu'un
   * qui a trop de résultats. Un « ou » élargirait, c'est-à-dire ferait
   * l'inverse de ce que le geste demande.
   */
  readonly tags?: readonly string[] | undefined;
}

/**
 * Une page de la bibliothèque, et le total pour la pagination.
 *
 * 🔴 `total` est le total **du filtre**, jamais celui du fonds. Sinon « charger
 * plus » promet des pages qui n'existent pas, et l'écran s'arrête sur un vide
 * qu'il avait annoncé plein.
 */
export interface LibraryMediaPage {
  readonly items: readonly LibraryMediaRecord[];
  readonly total: number;
  /** Où reprendre, ou `null` s'il ne reste rien. */
  readonly next: LibraryPosition | null;
}

/**
 * La LECTURE de la bibliothèque de visuels.
 *
 * Un port à part de {@link MediaLibrary}, qui écrit : un consommateur ne dépend
 * que des méthodes qu'il appelle (ISP). L'écran de la médiathèque lit ; il n'a
 * rien à faire d'`isStillOrphan` ni de `forget`.
 *
 * Rangé sous `shared/` et non sous `product/` parce que **la bibliothèque
 * n'appartient à aucun référentiel** — les fiches en portent, les familles
 * aussi (`CategoryMedia`). C'est déjà ce que disent les value-objects de
 * `shared/domain/value-objects/media.ts` : « ni l'un ni l'autre ne possède la
 * bibliothèque ».
 */
export abstract class MediaLibraryReader {
  /** Une page de la bibliothèque, dans l'ordre demandé. */
  abstract page(query: LibraryQuery): Promise<LibraryMediaPage>;

  /**
   * UNE image, par son URL — ou `null` si rien ne la porte.
   *
   * Sert à la suppression, qui doit connaître deux choses avant d'agir : le
   * nombre d'emplois, et la clé de stockage. Les relire par la page serait
   * faux — l'image visée peut être hors de la page affichée.
   */
  abstract find(url: string): Promise<LibraryMediaRecord | null>;
}
