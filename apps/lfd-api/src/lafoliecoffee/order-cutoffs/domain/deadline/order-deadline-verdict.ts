import type { LateFeeAdjustment, OrderCutoffStatus, OrderLimitSpec } from "@lfd/contracts";

/**
 * Ce qui a retenu une décision : la règle générale du commerce, la limite
 * propre d'un article, ou rien — aucune limite n'oppose quoi que ce soit.
 */
export type DeadlineSource = "general_rule" | "item_limit" | "none";

/**
 * **La limite propre d'un article**, et si l'équipe peut passer outre — une
 * décision du catalogue, prise au référentiel sur la limite du produit.
 */
export interface ItemOrderLimit extends OrderLimitSpec {
  readonly staffMayExceed: boolean;
}

/**
 * **Une limite d'article que la ligne a dépassée** : l'équipe, avec le droit,
 * a passé outre une limite que le produit permet de passer. De quoi la
 * consigner et la dire.
 */
export interface ExceededItemLimit {
  readonly sku: string;
  /** La limite telle qu'elle juge : délai et heure, rattrapage 0. */
  readonly rule: OrderLimitSpec;
  /** L'instant où elle est tombée pour cette journée. */
  readonly limit: Date;
}

/** Une dérogation ouverte, telle que la question l'a trouvée. */
export interface WaiverAvailable {
  readonly id: string;
}

/**
 * **Où en est un article** pour la journée demandée : la plus fermée entre la
 * règle générale et sa propre limite.
 */
export interface LineVerdict {
  readonly status: OrderCutoffStatus;
  readonly source: DeadlineSource;
  /** L'instant limite retenu pour cette ligne, ou `null` : rien à opposer. */
  readonly limit: Date | null;
  /**
   * L'état de la **seule** limite de l'article, sans la règle générale ni le
   * droit de passer outre : `open` sans limite propre. La modification par
   * l'équipe le lit — la règle générale ne lui est pas opposée.
   */
  readonly itemStatus: OrderCutoffStatus;
  /** La ligne a dépassé sa limite d'article (cf. {@link ExceededItemLimit}). */
  readonly exceeded: boolean;
  /**
   * Sa limite d'article **pourrait** être dépassée par celui qui demande : il
   * en a la capacité, le produit le permet, et une limite générale juge ce
   * jour-là. Vrai que la limite d'article ferme ou non — l'écran de l'équipe
   * dit « passer outre » ou « ne se commande plus » en le lisant sur une
   * ligne fermée par sa limite d'article.
   */
  readonly exceedable: boolean;
}

/**
 * Les bornes de la décision retenue pour le panier, **dans chaque état**.
 *
 * Elles restent lisibles en rattrapage et une fois fermé, parce que des
 * lecteurs les lisent dans ces états : la révisabilité annonce la limite
 * franchie, la hausse borne son délai de paiement par la limite la plus
 * proche, quel que soit l'état de la journée.
 */
export interface DeadlineBounds {
  /** L'instant limite retenu, ou `null` : rien à opposer, ou heure inexistante ce jour-là. */
  readonly limit: Date | null;
  /** La fin du rattrapage ; égale à `limit` quand il n'y en a pas. */
  readonly graceEnd: Date | null;
  /** Ce qui a retenu la décision du panier. */
  readonly source: DeadlineSource;
  /** La décision de chaque article, par SKU. */
  readonly lines: ReadonlyMap<string, LineVerdict>;
  /**
   * Les limites d'article dépassées, dans l'ordre du panier. Vide sans le
   * droit de passer outre ; un panier peut en porter et rester ouvert.
   */
  readonly exceeded: readonly ExceededItemLimit[];
}

/**
 * **Le verdict de l'heure limite** pour un panier, une journée, un instant.
 *
 * Trois variantes, la plus fermée du panier. La dérogation et la surtaxe
 * n'existent que sur `grace` : « une dérogation n'ouvre que le rattrapage »
 * n'est pas vérifié, c'est inexprimable.
 */
export type OrderDeadlineVerdict =
  | ({ readonly kind: "open" } & DeadlineBounds)
  | ({
      readonly kind: "grace";
      /** La dérogation qui ferait passer, ou `null` : aucune, ou non considérée. */
      readonly waiver: WaiverAvailable | null;
      /** Ce que passer coûterait : seulement avec une dérogation et un réglage de surtaxe. */
      readonly lateFee: LateFeeAdjustment | null;
    } & DeadlineBounds)
  | ({ readonly kind: "closed" } & DeadlineBounds);
