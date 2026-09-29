import {
  BagLoadedError,
  DeliveryRoundDepartedError,
  InvalidBagCountError,
} from "../errors/delivery-loading-errors.js";
import { bagCodeOf } from "../value-objects/bag-code.js";
import type { StopLoading } from "./stop-loading.js";

/** Au plus tant de sacs par déclaration — la borne du contrat, tenue ici aussi. */
export const MAX_BAGS_PER_DECLARATION = 20;

/** L'état persisté d'un sac. */
export interface DeliveryBagState {
  readonly id: string;
  readonly orderId: string;
  readonly code: string;
  readonly voidedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * **Un sac de livraison** (plan de tournée, lot 4, L4-C16, L4-C18) — il
 * appartient à la COMMANDE et naît quand on le DÉCLARE : l'imprimer est une
 * lecture, réimprimer ne crée rien. Un sac de trop s'annule ; il ne se supprime
 * jamais.
 *
 * Son chargement n'est PAS ici : il appartient à l'arrêt (`StopLoading`). Un
 * sac n'a pas de jour, son chargement en a un.
 */
export class DeliveryBag {
  private constructor(
    private readonly state: Omit<DeliveryBagState, "voidedAt">,
    private currentVoidedAt: Date | null,
  ) {}

  /**
   * Déclare des sacs pour une commande, un par code tiré. `loading` est le
   * chargement de l'arrêt vivant de la commande, ou `null` : une tournée partie
   * ne reçoit plus de sac, qui partirait non chargé (Q14, I6).
   *
   * @throws {InvalidBagCountError} @throws {InvalidBagCodeError}
   * @throws {DeliveryRoundDepartedError}
   */
  static declare(input: {
    readonly orderId: string;
    readonly bags: readonly { readonly id: string; readonly code: string }[];
    readonly at: Date;
    readonly loading: StopLoading | null;
  }): readonly DeliveryBag[] {
    if (input.bags.length < 1 || input.bags.length > MAX_BAGS_PER_DECLARATION) {
      throw new InvalidBagCountError(MAX_BAGS_PER_DECLARATION);
    }
    if (input.loading?.departed === true) {
      throw new DeliveryRoundDepartedError(input.loading.vehicleName, input.loading.serviceDay);
    }
    return input.bags.map(
      (bag) =>
        new DeliveryBag(
          { id: bag.id, orderId: input.orderId, code: bagCodeOf(bag.code), createdAt: input.at },
          null,
        ),
    );
  }

  static restore(state: DeliveryBagState): DeliveryBag {
    return new DeliveryBag(
      { id: state.id, orderId: state.orderId, code: state.code, createdAt: state.createdAt },
      state.voidedAt,
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

  get voidedAt(): Date | null {
    return this.currentVoidedAt;
  }

  /**
   * **Annule** l'étiquette d'un sac de trop (L4-C19). Rend `false` s'il l'était
   * déjà : rien ne s'écrit.
   *
   * `loading` est le chargement de l'arrêt vivant de la commande, ou `null`
   * si elle n'est dans aucune tournée.
   *
   * @throws {BagLoadedError} chargé : décharger d'abord.
   * @throws {DeliveryRoundDepartedError} sa tournée est partie.
   */
  void(at: Date, loading: StopLoading | null): boolean {
    if (this.currentVoidedAt !== null) {
      return false;
    }
    if (loading?.departed === true) {
      throw new DeliveryRoundDepartedError(loading.vehicleName, loading.serviceDay);
    }
    if (loading?.isLoaded(this.state.id) === true) {
      throw new BagLoadedError(this.state.code);
    }
    this.currentVoidedAt = at;
    return true;
  }

  toSnapshot(): DeliveryBagState {
    return { ...this.state, voidedAt: this.currentVoidedAt };
  }
}
