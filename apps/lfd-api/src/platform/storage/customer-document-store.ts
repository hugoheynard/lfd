import { DocumentStore } from "./document-store.js";

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
 * ## Ce qu'il contient, et comment c'est rangé
 *
 * Rangé par **commande**, pas par audience : la feuille d'atelier d'une commande
 * y vit à côté du bon du client, sous le même préfixe `orders/{orderId}/`. Tout
 * ce qui concerne la commande X est en X — et une règle de rétention se pose une
 * fois, à un endroit.
 *
 * Ce qui protège un client d'un autre n'est pas le bucket : c'est le préfixe de
 * clé, dérivé d'identifiants vérifiés, et le mur de la société côté API.
 */
export abstract class CustomerDocumentStore extends DocumentStore {}
