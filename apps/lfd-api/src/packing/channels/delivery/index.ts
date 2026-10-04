/**
 * **Le canal que le colisage publie POUR la livraison** (K2b,
 * `documentation/colisage/plan-les-bacs-au-colisage.md`, §5–§5.1).
 *
 * | Pièce                    | Déclaré par | Implémenté par | Ce qu'il porte                              |
 * | ------------------------ | ----------- | -------------- | ------------------------------------------- |
 * | `BinDesk`                | le colisage | la livraison   | déclarer, annuler, partager, proposer, vivants |
 * | `ContainerManagedOrders` | le colisage | le colisage    | « cette commande se gère-t-elle ici ? »      |
 *
 * `lint:context-boundaries` n'autorise `delivery → packing` que par ce dossier ;
 * `packing → delivery` reste interdit.
 */
export {
  BinDesk,
  type BinDeclarationRequest,
  type BinShareRequest,
  type DeskBin,
} from "./bin-desk.js";
export { ContainerManagedOrders } from "./container-managed-orders.reader.js";
