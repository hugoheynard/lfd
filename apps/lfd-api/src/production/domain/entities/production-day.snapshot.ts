import type { OrderSheetDetails } from "../../channels/commerce/day-orders.reader.js";
import type { PackingOwner } from "../value-objects/packing-owner.js";

/**
 * **La forme d'une journée de fabrication** — ce que l'agrégat porte, et ce que
 * l'adaptateur écrit et relit.
 *
 * Des types, et aucune règle. Sortis de `production-day.ts` le 2026-09-14,
 * quand le fichier dépassait six cents lignes : ils n'y portaient aucun
 * invariant, et les lire obligeait à traverser toutes les règles de la journée.
 * `production-day.ts` les réexporte — l'agrégat reste le point d'entrée.
 */

/**
 * Une ligne de commande, figée du côté de la production.
 *
 * Plus de `packed` depuis K3c (`colisage/colisage.md` §17.3) : ce
 * qui est au bac, c'est le colisage qui le tient. Les colonnes
 * `production_order_line.packed_*` restent en base, ni lues ni écrites.
 */
export interface ProductionLineSnapshot {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/**
 * **Le colisage constaté** : l'instant ET son auteur, ensemble.
 *
 * 🔴 C'étaient deux champs nullables jusqu'au 2026-09-08, et ils pouvaient donc
 * se contredire — un instant sans auteur, un auteur sans instant. Aucun des deux
 * n'a de sens, et le jour où il a fallu **republier** le fait, il fallait un
 * `?? ""` sur l'auteur : une identité vide dans un événement, pour un état que
 * le modèle laissait exister sans jamais le produire. On corrige le modèle.
 */
export interface PackedMark {
  readonly at: Date;
  readonly by: string;
}

/** Une commande, figée du côté de la production. */
export interface ProductionOrderSnapshot {
  /**
   * La fermeture du bac **au colisage**, ou `null`. Le dépôt ne la lit ni ne
   * l'écrit depuis K3c (`colisage/colisage.md` §17.3) : elle vaut
   * `null` au chargement, et seule `SealedDayReading` la pose, en lecture, à
   * partir de `PackedOrdersReader`. Les colonnes `production_order.packed_*` et
   * `container_count` restent en base, mortes.
   */
  readonly packed: PackedMark | null;
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  readonly destination: string;
  /**
   * `HH:mm` — début du créneau, sinon fin de l'échéance ; `null` = aucune
   * (colisage, §13). Gardée pour qu'une republication de la liste la retrouve.
   */
  readonly dueAt: string | null;
  readonly lines: readonly ProductionLineSnapshot[];
  /**
   * Le reste du bon, figé à l'arrêt (E1b, 2026-10-06). `null` = commande
   * figée avant le lot : le dossier omet alors ces lignes.
   */
  readonly sheetDetails: OrderSheetDetails | null;
}

/**
 * **La ligne est sortie du four**, telle que le fournil la constate.
 *
 * Un seul objet et pas trois champs nullables, pour la raison exacte que
 * {@link PackedMark} a déjà coûtée : un instant sans auteur, ou un auteur sans
 * instant, sont deux états que rien ne produit et que le modèle laissait
 * pourtant exister.
 *
 * `initials` peut être vide sur une ligne pourtant faite — on coche d'abord, on
 * signe si on veut. C'est un quatrième état volontaire, et le seul.
 */
export interface DoneMark {
  readonly at: Date;
  readonly by: string;
  readonly initials: string;
}

/** Ce qu'il faut fabriquer d'un article, tous clients confondus. */
export interface ProducedItemSnapshot {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  /**
   * **La coche de l'ANCIEN binaire**, telle que `done_*` la porte encore.
   *
   * Depuis les fournées (plan `plan-fournees-progressives.md`, §5), plus rien
   * ne l'écrit : elle ne sert qu'à lire une ligne cochée avant le déploiement,
   * ou par un poste resté sur le binaire précédent, comme une **fournée
   * implicite** de `quantity` — tant qu'aucune fournée réelle n'existe pour ce
   * SKU. `null` = rien de coché par l'ancien système.
   */
  readonly done: DoneMark | null;
}

/**
 * **Une fournée** : ce que le four a sorti d'un article, à un instant.
 *
 * `recorded` a la forme de {@link DoneMark} et c'est le même fait — « c'est
 * sorti du four », signé — pour une partie de la ligne au lieu de toute.
 *
 * `cancelled` : une fournée saisie par erreur s'annule entière, jamais ne se
 * supprime ni ne se corrige (D3). `null` = elle compte.
 */
export interface ProductionBatchSnapshot {
  /** Donné par le client (ULID), ou déterministe (`backfill-…`, `mark-…`). */
  readonly id: string;
  readonly sku: string;
  readonly quantity: number;
  readonly recorded: DoneMark;
  readonly cancelled: PackedMark | null;
  /**
   * Les pièces que le COLISAGE a rendues sur cette fournée (journée `packing`,
   * K2, §13 B2) : « sorti » en est diminué. Un retour total l'annule ; un
   * retour partiel la laisse compter pour le reste. `0` sur une journée
   * `legacy`, dont l'annulation reste synchrone.
   */
  readonly returned: number;
  /** Les pièces demandées en retour, sans réponse encore — « retour en attente ». */
  readonly pendingReturn: number;
}

/** L'état d'une journée, tel que l'adaptateur l'écrit et le relit. */
export interface ProductionDaySnapshot {
  readonly serviceDay: string;
  readonly closedAt: Date | null;
  /** Le dernier retirage — `null` tant que la journée porte son tirage d'origine. */
  readonly retaken: PackedMark | null;
  /** Qui colise la journée — écrit à la clôture (colisage, §13, B1). */
  readonly packingOwner: PackingOwner;
  readonly orders: readonly ProductionOrderSnapshot[];
  readonly counts: readonly ProducedItemSnapshot[];
  /** Toutes les fournées du jour, annulées comprises, dans l'ordre de la base. */
  readonly batches: readonly ProductionBatchSnapshot[];
}
