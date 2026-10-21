/**
 * **Le canal que le colisage publie POUR la livraison** (K2b,
 * `documentation/colisage/colisage.md`, §5–§5.1).
 *
 * | Pièce                    | Déclaré par | Implémenté par | Ce qu'il porte                              |
 * | ------------------------ | ----------- | -------------- | ------------------------------------------- |
 * | `BinDesk`                | le colisage | la livraison   | déclarer, annuler, partager, proposer, contenances, moitiés libres, vivants |
 * | `ContainerManagedOrders` | le colisage | le colisage    | « cette commande se gère-t-elle ici ? »      |
 * | `OrderDeparturesReader`  | le colisage | la livraison   | « quand partent ces commandes ? » (L2)       |
 * | `PackedResuppliesReader` | le colisage | le colisage    | l'emballé d'une fiche de réassort close (R3c) |
 *
 * `lint:context-boundaries` n'autorise `delivery → packing` que par ce dossier ;
 * `packing → delivery` reste interdit.
 */
export {
  BinDesk,
  type BinDeclarationRequest,
  type BinShareRequest,
  type DeskBin,
  type DeskCapacity,
  type DeskColdPacking,
} from "./bin-desk.js";
export { ContainerManagedOrders } from "./container-managed-orders.reader.js";
export {
  OrderDeparturesReader,
  type OrderDeparture,
  type OrderDepartureVia,
} from "./order-departures.reader.js";
// La MÊME classe que `packing/channels/commerce/` (réassort, R3c) : le
// transfert dit l'emballé d'une fiche close. Un port, deux lecteurs.
export {
  PackedResuppliesReader,
  type PackedResupplyLines,
} from "../commerce/packed-resupplies.reader.js";
