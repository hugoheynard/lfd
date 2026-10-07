import type { DeliveryBinFreeHalvesView, DeliveryPackingProposalView } from "@lfd/contracts";

/** Un bac à déclarer pour une commande : un bac entier, ou la moitié gauche d'un bac neuf. */
export interface BinDeclarationRequest {
  readonly orderId: string;
  readonly binTypeId: string;
  /** `true` = une moitié (la gauche d'un bac physique neuf) ; `false` = un bac entier. */
  readonly half: boolean;
  /** Les sacs posés dans le bac — informatif, imprimé sur l'étiquette. */
  readonly innerBags: number;
}

/** L'autre moitié d'un bac dont une moitié est déjà à une commande voisine. */
export interface BinShareRequest {
  readonly orderId: string;
  readonly partnerBinId: string;
  readonly innerBags: number;
}

/** Le bac que la livraison a déclaré : son identifiant (celui du QR) et son code court. */
export interface DeskBin {
  readonly binId: string;
  readonly code: string;
  /** `null` = un bac entier. */
  readonly half: "left" | "right" | null;
}

/** Une case de la grille des contenances : un bac ENTIER de ce type tient `units` pièces. */
/** Ce que le froid demande au poste : les SKU froids, et les bacs isothermes vivants. */
export interface DeskColdPacking {
  /** Les SKU que la fiche produit déclare froids — `false` n'affirme rien. */
  readonly coldSkus: ReadonlySet<string>;
  /** Parmi les bacs NON annulés de ces commandes, ceux d'un type isotherme. */
  readonly isothermBinIds: ReadonlySet<string>;
}

export interface DeskCapacity {
  readonly binTypeId: string;
  readonly sku: string;
  readonly units: number;
}

/**
 * **Le guichet des bacs** — port que le colisage DÉCLARE et que la livraison
 * IMPLÉMENTE (plan `documentation/colisage/colisage.md`, K2b,
 * §5–§5.1).
 *
 * La livraison garde le BAC : son code court unique « sur tous les bacs,
 * annulés compris », son QR (qui porte l'identifiant), son chargement, son
 * départ. Le colisage garde le CONTENU. Un bac naît donc par une décision
 * SYNCHRONE de la livraison, dont les refus d'aujourd'hui — type archivé ou non
 * divisible, commande hors livraison ou annulée, tournée partie, bac chargé —
 * remontent tels quels à l'écran du colisage.
 *
 * 🔴 **Dans la transaction de l'appelant.** L'implémentation ouvre son unité de
 * travail, qui REJOINT celle du colisage déjà ouverte : le bac et son contenant
 * s'écrivent ensemble, ou pas du tout (§5.1, B2).
 *
 * `packing → delivery` reste interdit : le colisage ne sait pas qui le branche,
 * et « Proposer » — qui lit les contenances de la livraison — ne fait donc pas
 * de cycle.
 */
export abstract class BinDesk {
  /** Déclare un bac. Les refus sont ceux de la déclaration de la livraison. */
  abstract declareBin(request: BinDeclarationRequest): Promise<DeskBin>;

  /**
   * Annule l'étiquette d'un bac. Refusé s'il est chargé ou si sa tournée est
   * partie ; un bac déjà annulé n'écrit rien.
   */
  abstract voidBin(binId: string): Promise<void>;

  /** Déclare l'autre moitié d'un bac partagé, aux mêmes refus que la livraison. */
  abstract shareHalf(request: BinShareRequest): Promise<DeskBin>;

  /** Le colisage proposé d'une commande livrée — une lecture, qui n'écrit rien. */
  abstract propose(orderId: string): Promise<DeliveryPackingProposalView>;

  /**
   * Les contenances des types EN SERVICE — celles que « Proposer » a lues, pour
   * couper un contenu par type en bacs (suite de K2b, plan §7).
   */
  abstract capacities(): Promise<readonly DeskCapacity[]>;

  /**
   * Les moitiés libres des arrêts voisins, partageables par cette commande —
   * la règle d'adjacence de la livraison. Une LECTURE ; mêmes refus qu'au
   * partage (commande hors livraison, annulée).
   */
  abstract freeHalves(orderId: string): Promise<DeliveryBinFreeHalvesView>;

  /**
   * Ces bacs de la commande sont-ils encore à portée de main — aucun chargé,
   * tournée pas partie ? Une vérification sans écriture, demandée avant de
   * rouvrir une commande fermée (plan `colisage/colisage.md`,
   * §17.2, option b). Mêmes refus que l'annulation d'un bac.
   */
  abstract assertAtHand(orderId: string, binIds: readonly string[]): Promise<void>;

  /**
   * Ceux de ces bacs qui existent et ne sont pas annulés. Défense en
   * profondeur (§5.1, B1) : le colisage ne compte jamais un contenant dont le
   * bac est annulé, même si l'annulation lui avait échappé.
   */
  abstract liveBins(binIds: readonly string[]): Promise<ReadonlySet<string>>;

  /**
   * Le froid de ces commandes (2026-10-07, audit livraisons Q3) : quels SKU
   * demandent le froid, et lesquels de leurs bacs sont isothermes. Une
   * LECTURE, pour AVERTIR au poste — jamais refuser « Déclarer prête ».
   */
  abstract coldPacking(orderIds: readonly string[]): Promise<DeskColdPacking>;
}
