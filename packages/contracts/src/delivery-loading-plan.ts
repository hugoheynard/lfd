import type { DeliveryBinHalf } from "./delivery-loading.js";

/**
 * **Le plan de chargement** — un plan d'ORDRE et de VOLUME, et depuis G5 la
 * place des piles au sol (`documentation/livraisons/plan-preparation-de-tournee.md`,
 * lot 4 bis, L4b-C7 et v2-5, tranche D ; `plan-geometrie-du-plancher.md`, G-D4).
 *
 * `GET admin/livraison/chargement/:roundId/plan` → {@link DeliveryLoadingPlanView},
 * sous `delivery_loading:read` — le droit des autres lectures du chargement.
 *
 * Le plan SUGGÈRE un ordre de scan ; il ne l'impose pas : charger un bac hors
 * de son étape reste accepté (le scan ne vérifie que la tournée).
 */

/** Un bac (ou une moitié) à charger à une étape. */
export interface DeliveryLoadingPlanBinView {
  readonly binId: string;
  readonly code: string;
  /** Le numéro de la commande À QUI est ce bac (ou cette moitié). */
  readonly reference: string;
  readonly binTypeName: string;
  /** `null` = bac entier. */
  readonly half: DeliveryBinHalf | null;
  /** Référence de l'autre commande d'un bac partagé, ou `null`. */
  readonly sharedWithReference: string | null;
  readonly isotherm: boolean;
  /** La pile où poser le bac (1..n, cf. {@link DeliveryLoadingPlanStackView}). */
  readonly stackIndex: number;
  /**
   * Posé DERRIÈRE : sur une pile d'une rangée déjà fermée, des bacs chargés
   * après lui le cachent. Seulement quand le plan cohérent ne tenait pas au
   * sol (`documentation/livraisons/algorithme-de-chargement.md`).
   */
  readonly behind: boolean;
}

/**
 * Une étape du chargement : les bacs d'un arrêt. Les étapes vont dans l'ORDRE
 * DE CHARGEMENT — l'inverse de la tournée : le dernier arrêt d'abord, au fond.
 *
 * Un bac PARTAGÉ (ses deux moitiés) est chargé à l'étape du PREMIER de ses
 * deux arrêts dans la tournée, en DERNIER de l'étape : en haut de sa pile.
 * Un arrêt sans bac garde son étape, vide.
 */
export interface DeliveryLoadingPlanStepView {
  /** 1..n, dans l'ordre de chargement. */
  readonly step: number;
  /** La position de l'arrêt dans la tournée (celle de l'écran de chargement). */
  readonly stopPosition: number;
  readonly reference: string;
  readonly customerLabel: string;
  readonly bins: readonly DeliveryLoadingPlanBinView[];
}

/**
 * Une pile : des bacs PHYSIQUES d'un même type, posés dans l'ordre de
 * chargement jusqu'à `maxStack`. Règle : chaque bac va sur la dernière pile
 * ouverte de son type si elle n'est pas pleine et que sa rangée est encore la
 * rangée ouverte (G-D4 ter, 2026-10-03), sinon il en ouvre une. Une
 * pile peut donc porter plusieurs arrêts — le suivant chargé (= le précédent
 * livré) se pose au-dessus, et il descend en premier.
 */
export interface DeliveryLoadingPlanStackView {
  /** 1..n, dans l'ordre d'ouverture. */
  readonly stackIndex: number;
  readonly binTypeName: string;
  /**
   * Hauteur EXTÉRIEURE d'un bac de la pile, en cm : l'écran dessine les bacs
   * à proportion, pour qu'un Bac L se lise plus haut qu'un Bac M. Un type de
   * bac se mesure au millimètre (2026-10-07) : une décimale possible (71,5).
   */
  readonly binTypeHeightCm: number;
  /** Nombre de bacs physiques (un bac partagé compte pour un). */
  readonly height: number;
  readonly maxStack: number;
  /** Les positions d'arrêt présentes, du bas vers le haut, sans doublon. */
  readonly stopPositions: readonly number[];
  /**
   * Où poser la pile (G5, stratégie B), ou `null` : le plancher du véhicule
   * est inconnu ({@link DeliveryLoadingPlanView.floor} vaut alors `null`).
   */
  readonly placement: DeliveryLoadingPlanPlacementView | null;
}

/**
 * La pile posée au sol. Repère : `x` depuis le FOND (la cloison), `y` depuis
 * le flanc gauche vu des portes arrière ; empreinte EXTÉRIEURE, sans le jeu.
 * En cm, le repère du plancher — calculées au millimètre, elles peuvent
 * porter une décimale (66,5) depuis le 2026-10-07.
 */
export interface DeliveryLoadingPlanFloorPlacementView {
  readonly kind: "floor";
  /** 1..n, depuis le fond. */
  readonly row: number;
  readonly xCm: number;
  readonly yCm: number;
  readonly depthCm: number;
  readonly widthCm: number;
  readonly orientation: "length" | "turned";
}

/**
 * Au sol, dans la caisse réfrigérée (le froid reste en litres, sans position),
 * ou hors plancher — l'alerte `floor_over`.
 */
export type DeliveryLoadingPlanPlacementView =
  | DeliveryLoadingPlanFloorPlacementView
  | { readonly kind: "refrigerated" }
  | { readonly kind: "off_floor" };

/** Le plancher vu de dessus : ce qu'il faut pour le dessiner. */
export interface DeliveryLoadingPlanFloorView {
  readonly lengthCm: number;
  readonly widthCm: number;
  /** Une paire symétrique, ou `null` : un rectangle. */
  readonly wheelArches: {
    readonly fromBackCm: number;
    readonly lengthCm: number;
    readonly protrusionCm: number;
  } | null;
}

/**
 * Le volume EXTÉRIEUR des bacs physiques, en litres (arrondi au-dessus), face
 * au véhicule. Les isothermes vont au froid si le véhicule a une caisse
 * réfrigérée, sinon au sec (avec une alerte). Le sec disponible est le volume
 * utile MOINS la caisse réfrigérée, qui s'y trouve (L2b-C2 : elle n'excède
 * jamais le volume utile). Capacité `null` = inconnue : jamais « ça tient ».
 */
export interface DeliveryLoadingPlanVolumeView {
  readonly dryLiters: number;
  readonly coldLiters: number;
  readonly dryCapacityLiters: number | null;
  readonly coldCapacityLiters: number | null;
  readonly dryOver: boolean;
  readonly coldOver: boolean;
}

/**
 * `floor_over` (G5) : des piles ne tiennent pas au sol ; s'ajoute à `dry_over`.
 * `compacted` (2026-10-03) : tout tient au sol, mais des bacs sont posés
 * derrière d'autres (`DeliveryLoadingPlanBinView.behind`).
 */
export type DeliveryLoadingPlanWarningKind =
  | "dry_over"
  | "cold_over"
  | "cold_bins_without_refrigeration"
  | "unknown_cargo"
  | "bin_to_redo"
  | "floor_over"
  | "compacted";

export interface DeliveryLoadingPlanWarningView {
  readonly kind: DeliveryLoadingPlanWarningKind;
  /** La phrase à afficher : le cas réel et le geste de sortie. */
  readonly message: string;
}

/** **Le plan de chargement d'une tournée.** Une tournée sans bac rend un plan vide. */
export interface DeliveryLoadingPlanView {
  readonly roundId: string;
  readonly vehicleName: string;
  readonly order: readonly DeliveryLoadingPlanStepView[];
  readonly stacks: readonly DeliveryLoadingPlanStackView[];
  /** Le plancher du véhicule (G5), ou `null` : dimensions non renseignées. */
  readonly floor: DeliveryLoadingPlanFloorView | null;
  readonly volume: DeliveryLoadingPlanVolumeView;
  readonly warnings: readonly DeliveryLoadingPlanWarningView[];
}
