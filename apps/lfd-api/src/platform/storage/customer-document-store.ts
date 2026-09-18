import type { StoredDocument } from "./document-store.js";

/**
 * Le stockage des pièces **attachées à un client** : les papiers de ses
 * commandes, et bientôt les factures déposées par le comptable.
 *
 * ## Pourquoi un second port, et pas le même
 *
 * `DocumentStore` sert le bucket des pièces que le CLIENT nous remet — extrait
 * de greffe, mandat signé. Celui-ci sert celui des pièces attachées à ses
 * commandes. Ce ne sont pas les mêmes buckets, **ni les mêmes clés**, et la
 * configuration le dit : « chaque usage porte son bucket ET ses clés : un jeton
 * n'ouvre que le sien ».
 *
 * Deux ports plutôt qu'un paramètre passé à l'appel : un appelant ne choisit pas
 * le bucket dans lequel il écrit. Il déclare **de quel stockage il dépend**, et
 * la racine de composition lui donne le bon. Un `save(usage, key, …)` aurait
 * rendu possible d'écrire un bon de commande chez les KBIS par une faute de
 * frappe.
 *
 * ## 🔴 Pourquoi il n'a PAS de `delete`
 *
 * **On ne supprime pas une pièce qu'un client peut nous opposer** (Hugo,
 * 2026-09-17 : « on ne peut pas supprimer un bon qui a été émis à juste
 * titre »). Ce port héritait de `DocumentStore`, donc de son `delete` : la
 * règle ne tenait que parce que personne n'avait encore écrit l'appel.
 *
 * Il n'hérite plus de rien, et le verbe n'existe pas — ni dans le type, ni sur
 * l'objet que la racine de composition fournit ({@link KeptDocumentStore}).
 * Une suppression n'est pas refusée ici : elle est **inexprimable**.
 *
 * « À juste titre » laisse une porte, et elle n'est pas dans le code : un bon
 * qui n'aurait jamais dû exister se retire par un geste humain décidé au cas
 * par cas, comme la remise à blanc (`CLAUDE.md` §0). Cf.
 * `documentation/order/todo-conservation-des-bons-en-r2.md`.
 *
 * ⚠️ Écraser reste possible : `save` sur une clé existante remplace. C'est sans
 * risque pour le bon tant que sa clé porte la révision et que son rendu est
 * déterministe (`OrderSheetArchive`) — deux écritures de la même révision
 * rangent les mêmes octets.
 *
 * ## Ce qu'il contient, et comment c'est rangé
 *
 * Rangé par **commande**, sous le préfixe `orders/{orderId}/` : le bon du client
 * et l'exemplaire du bureau y vivent côte à côte.
 *
 * 🔴 **La feuille d'atelier n'y est PAS**, et ce paragraphe disait le contraire.
 * Elle vit dans le bucket `production`, avec le compte à produire — décidé le
 * 2026-09-07. La ligne de partage n'est pas « client contre production », c'est
 * **opposable contre opérationnel** : ce qu'un client peut nous opposer se garde
 * des années et porte des montants ; ce qui documente une journée de fournil se
 * garde des semaines et n'en porte aucun. Deux durées de vie, deux jetons — et
 * le jour où une borne au fournil lit des documents, le jeton `customers` lui
 * donnerait aussi toutes les factures.
 *
 * Cf. `documentation/order/architecture-pieces-en-r2.md`.
 *
 * Ce qui protège un client d'un autre n'est pas le bucket : c'est le préfixe de
 * clé, dérivé d'identifiants vérifiés, et le mur de la société côté API.
 */
export abstract class CustomerDocumentStore {
  /**
   * Range la pièce sous cette clé et renvoie la clé. Une même clé écrase.
   * @throws {DocumentStorageUnavailableError} stockage non configuré ou en échec.
   */
  abstract save(key: string, document: StoredDocument): Promise<string>;

  /**
   * Relit la pièce par sa clé ; l'absence est une **panne**.
   * @throws {DocumentStorageUnavailableError} stockage non configuré, en échec,
   *   ou pièce absente.
   */
  abstract read(key: string): Promise<Buffer>;

  /**
   * Relit la pièce si elle existe, `null` sinon.
   * @throws {DocumentStorageUnavailableError} stockage non configuré ou en échec.
   */
  abstract readIfPresent(key: string): Promise<Buffer | null>;
}
