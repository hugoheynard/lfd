import {
  BinHalfTakenError,
  BinNotShareableError,
  SharedBinNotAdjacentError,
} from "../errors/delivery-bin-declaration-errors.js";
import { BinLoadedError, DeliveryRoundDepartedError } from "../errors/delivery-loading-errors.js";
import {
  type BinDeclaration,
  type BinHalf,
  ensureDeclarable,
  innerBagsOf,
  otherHalf,
} from "../value-objects/bin-declaration.js";
import { binCodeOf } from "../value-objects/bin-code.js";
import type { BinType } from "./bin-type.js";
import type { StopLoading } from "./stop-loading.js";

/** L'état persisté d'un bac déclaré. */
export interface DeliveryBinState {
  readonly id: string;
  readonly orderId: string;
  readonly binTypeId: string;
  /** `null` = bac entier. */
  readonly half: BinHalf | null;
  /** Le bac physique d'une moitié ; `null` pour un bac entier. */
  readonly physicalBinId: string | null;
  readonly innerBags: number;
  readonly code: string;
  readonly voidedAt: Date | null;
  readonly createdAt: Date;
}

/** L'identité d'un bac à naître : son id (le QR) et son code tiré. */
export interface BinIdentity {
  readonly id: string;
  readonly code: string;
}

/**
 * **Un bac déclaré** (plan de tournée, lot 4, L4-C16, L4-C18 ; lot 4 bis,
 * v2-4) — un bac ENTIER, ou une MOITIÉ de bac cloisonné : l'unité qu'on
 * scanne. Il appartient à la COMMANDE et naît quand on le DÉCLARE :
 * l'imprimer est une lecture, réimprimer ne crée rien. Un bac de trop
 * s'annule ; il ne se supprime jamais.
 *
 * Deux moitiés d'un même bac physique partagent `physicalBinId` ; la base
 * tient qu'il n'y en a jamais deux du même côté parmi les non annulées.
 *
 * Son chargement n'est PAS ici : il appartient à l'arrêt (`StopLoading`). Un
 * bac n'a pas de jour, son chargement en a un.
 */
export class DeliveryBin {
  private constructor(
    private readonly state: Omit<DeliveryBinState, "voidedAt">,
    private currentVoidedAt: Date | null,
  ) {}

  /**
   * Déclare des bacs d'un type pour une commande : d'abord les entiers, puis
   * la moitié — la GAUCHE d'un bac physique neuf (`physicalBinId`), dont la
   * droite reste libre. `identities` en porte exactement `declaration.count`.
   * `loading` est le chargement de l'arrêt vivant de la commande, ou `null` :
   * une tournée partie ne reçoit plus de bac, qui partirait non chargé (Q14, I6).
   *
   * @throws {InvalidBinCodeError} @throws {DeliveryRoundDepartedError}
   */
  static declare(input: {
    readonly orderId: string;
    readonly declaration: BinDeclaration;
    readonly identities: readonly BinIdentity[];
    readonly physicalBinId: string;
    readonly at: Date;
    readonly loading: StopLoading | null;
  }): readonly DeliveryBin[] {
    ensureAtDepot(input.loading);
    const { declaration } = input;
    return input.identities.slice(0, declaration.count).map((identity, index) => {
      const isHalf = index >= declaration.whole;
      return DeliveryBin.born(input.orderId, identity, input.at, {
        binTypeId: declaration.binType.id,
        half: isHalf ? "left" : null,
        physicalBinId: isHalf ? input.physicalBinId : null,
        innerBags: declaration.innerBags,
      });
    });
  }

  /**
   * **Partage** un bac cloisonné (v2-4, dernier recours) : déclare, pour
   * `orderId`, l'AUTRE moitié du bac physique de `partner`. Les deux commandes
   * doivent être dans la même tournée au dépôt, à des arrêts consécutifs —
   * `loading` est celui de `orderId`, et c'est sa tournée qui en juge.
   *
   * @throws {BinNotShareableError} @throws {BinHalfTakenError}
   * @throws {BinTypeArchivedForDeclarationError} @throws {BinTypeNotDivisibleError}
   * @throws {SharedBinNotAdjacentError} @throws {DeliveryRoundDepartedError}
   * @throws {InvalidInnerBagsError} @throws {InvalidBinCodeError}
   */
  static shareHalf(input: {
    readonly orderId: string;
    readonly partner: DeliveryBin;
    /** Les moitiés NON annulées du bac physique de `partner`, `partner` compris. */
    readonly liveHalves: readonly DeliveryBin[];
    readonly binType: BinType;
    readonly identity: BinIdentity;
    readonly innerBags: number;
    readonly names: { readonly reference: string; readonly partnerReference: string };
    readonly at: Date;
    readonly loading: StopLoading | null;
  }): DeliveryBin {
    const { partner } = input;
    const partnerHalf = shareableHalfOf(partner, input.orderId);
    if (input.liveHalves.some((half) => half.id !== partner.id)) {
      throw new BinHalfTakenError(partner.code);
    }
    const innerBags = innerBagsOf(input.innerBags);
    ensureDeclarable(input.binType, true);
    ensureAtDepot(input.loading);
    if (input.loading?.isConsecutiveTo(partner.orderId) !== true) {
      throw new SharedBinNotAdjacentError(input.names.reference, input.names.partnerReference);
    }
    return DeliveryBin.born(input.orderId, input.identity, input.at, {
      binTypeId: partner.binTypeId,
      half: otherHalf(partnerHalf.half),
      physicalBinId: partnerHalf.physicalBinId,
      innerBags,
    });
  }

  static restore(state: DeliveryBinState): DeliveryBin {
    const { voidedAt, ...rest } = state;
    return new DeliveryBin(rest, voidedAt);
  }

  private static born(
    orderId: string,
    identity: BinIdentity,
    at: Date,
    shape: Pick<DeliveryBinState, "binTypeId" | "half" | "physicalBinId" | "innerBags">,
  ): DeliveryBin {
    return new DeliveryBin(
      { id: identity.id, orderId, code: binCodeOf(identity.code), createdAt: at, ...shape },
      null,
    );
  }

  get id(): string {
    return this.state.id;
  }

  get orderId(): string {
    return this.state.orderId;
  }

  get code(): string {
    return this.state.code;
  }

  get binTypeId(): string {
    return this.state.binTypeId;
  }

  get half(): BinHalf | null {
    return this.state.half;
  }

  get physicalBinId(): string | null {
    return this.state.physicalBinId;
  }

  get innerBags(): number {
    return this.state.innerBags;
  }

  get voidedAt(): Date | null {
    return this.currentVoidedAt;
  }

  /**
   * **Annule** l'étiquette d'un bac de trop (L4-C19). Rend `false` s'il l'était
   * déjà : rien ne s'écrit. Annuler une moitié libère son côté du bac physique.
   *
   * `loading` est le chargement de l'arrêt vivant de la commande, ou `null`
   * si elle n'est dans aucune tournée.
   *
   * @throws {BinLoadedError} chargé : décharger d'abord.
   * @throws {DeliveryRoundDepartedError} sa tournée est partie.
   */
  void(at: Date, loading: StopLoading | null): boolean {
    if (this.currentVoidedAt !== null) {
      return false;
    }
    this.ensureAtHand(loading);
    this.currentVoidedAt = at;
    return true;
  }

  /**
   * Le bac est-il encore à portée de main — au dépôt, pas chargé ? La règle de
   * {@link void}, servie aussi au colisage qui rouvre une commande (plan
   * `colisage/plan-domaine-colisage.md`, §17.2) : on ne défait pas le
   * rangement d'un bac déjà dans le véhicule.
   *
   * @throws {BinLoadedError} chargé : décharger d'abord.
   * @throws {DeliveryRoundDepartedError} sa tournée est partie.
   */
  ensureAtHand(loading: StopLoading | null): void {
    ensureAtDepot(loading);
    if (loading?.isLoaded(this.state.id) === true) {
      throw new BinLoadedError(this.state.code);
    }
  }

  toSnapshot(): DeliveryBinState {
    return { ...this.state, voidedAt: this.currentVoidedAt };
  }
}

/** @throws {DeliveryRoundDepartedError} */
function ensureAtDepot(loading: StopLoading | null): void {
  if (loading?.departed === true) {
    throw new DeliveryRoundDepartedError(loading.vehicleName, loading.serviceDay);
  }
}

/** La moitié partenaire, vivante, d'une AUTRE commande. @throws {BinNotShareableError} */
function shareableHalfOf(
  partner: DeliveryBin,
  orderId: string,
): { readonly half: BinHalf; readonly physicalBinId: string } {
  if (partner.voidedAt !== null) {
    throw new BinNotShareableError(partner.code, "voided");
  }
  if (partner.half === null || partner.physicalBinId === null) {
    throw new BinNotShareableError(partner.code, "whole");
  }
  if (partner.orderId === orderId) {
    throw new BinNotShareableError(partner.code, "same_order");
  }
  return { half: partner.half, physicalBinId: partner.physicalBinId };
}
