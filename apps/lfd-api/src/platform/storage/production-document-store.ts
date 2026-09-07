import { DocumentStore } from "./document-store.js";

/**
 * Le stockage des pièces qui documentent **notre travail** : la feuille
 * d'atelier d'une commande, et le compte à produire d'une journée.
 *
 * ## Pourquoi un troisième port
 *
 * Même raison que le second, et elle vaut d'être répétée parce qu'elle ne se
 * devine pas : « chaque usage porte son bucket ET ses clés — un jeton n'ouvre
 * que le sien ». Un appelant ne choisit pas le bucket dans lequel il écrit ; il
 * déclare **de quel stockage il dépend**, et la racine de composition lui donne
 * le bon.
 *
 * ## La ligne de partage avec `customers` : opposable contre opérationnel
 *
 * Ce n'est PAS « client contre production ». Ce qu'un client peut nous opposer
 * se garde des années et porte des montants ; ce qui documente une journée de
 * fournil se garde des semaines et n'en porte **aucun**.
 *
 * Le critère décisif est le jeton : le jour où une borne au fournil ou un
 * service d'impression doit lire des documents, lui donner celui de `customers`
 * lui donnerait aussi **toutes les factures**. C'est là qu'il fallait couper.
 *
 * ⚠️ **Aucun montant ne doit atterrir ici**, et ce n'est pas qu'une consigne :
 * la feuille d'atelier n'a pas de champ de prix — l'absence est portée par son
 * type. Le compte à produire non plus : c'est un compte de matière.
 *
 * Cf. `documentation/order/architecture-pieces-en-r2.md`.
 */
export abstract class ProductionDocumentStore extends DocumentStore {}
