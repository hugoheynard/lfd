import type { ShipmentRef } from "../../../production/channels/delivery/index.js";
import { InvalidServiceDayError } from "../errors/delivery-round-errors.js";
import { isCalendarDay } from "../value-objects/service-day.js";

/** Ce qu'une ligne relue rend à l'agrégat. */
export interface DeliveryDayReadinessState {
  readonly serviceDay: string;
  readonly closedAt: Date | null;
  /** Les envois rangés (plan E7 reliquat, choix 12) — une commande peut en avoir deux. */
  readonly shipments: readonly ShipmentRef[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * **Le plan arrêté, vu par la livraison** (`documentation/livraisons/tournees/composition-automatique.md`,
 * §4, CA6a) : par journée, l'ENSEMBLE des livraisons que les faits du
 * fournil lui ont apprises. Une livraison est un ENVOI `(commande, rang)`
 * depuis le plan E7 reliquat (L3c) : deux rangs d'une commande comptent pour
 * deux.
 *
 * L'invariant est structurel : TANT QUE le plan tient, l'ensemble ne fait
 * que grandir. Chaque fait — clôture, réannonce, retirage (CA6b) — en fait
 * l'UNION ; un fait rejoué, ou une réannonce qui recouvre ce qu'on sait déjà,
 * n'ajoute rien. `closedAt` se pose à la première clôture reçue et ne bouge
 * plus — sauf la réouverture (Hugo, 2026-10-14, qui lève le S1 « une journée
 * close ne se rouvre pas ») : elle oublie le plan entier, et la clôture
 * suivante repart de zéro.
 *
 * Ce que l'appelant en tire — sonner ou non — est le nombre de livraisons à
 * ANNONCER, rendu par `learnClosure` et `learnRetake` : rien n'est annoncé
 * tant que le plan n'est pas arrêté, et l'arrêt annonce tout ce qu'on sait.
 */
export class DeliveryDayReadiness {
  private constructor(
    readonly serviceDay: string,
    private closed: Date | null,
    private known: readonly ShipmentRef[],
    readonly createdAt: Date,
    private touchedAt: Date,
  ) {}

  /**
   * Une journée dont la livraison n'a encore rien appris.
   *
   * @throws {InvalidServiceDayError} le jour n'existe pas au calendrier.
   */
  static start(serviceDay: string, at: Date): DeliveryDayReadiness {
    if (!isCalendarDay(serviceDay)) {
      throw new InvalidServiceDayError(serviceDay);
    }
    return new DeliveryDayReadiness(serviceDay, null, [], at, at);
  }

  /** Relit une ligne rangée ; le jour revalide. */
  static restore(state: DeliveryDayReadinessState): DeliveryDayReadiness {
    const day = DeliveryDayReadiness.start(state.serviceDay, state.createdAt);
    day.closed = state.closedAt;
    day.union(state.shipments, state.updatedAt);
    return day;
  }

  get closedAt(): Date | null {
    return this.closed;
  }

  get updatedAt(): Date {
    return this.touchedAt;
  }

  /** Triés par commande puis rang : une ligne réécrite à l'identique ne change pas de forme. */
  get shipments(): readonly ShipmentRef[] {
    return [...this.known].sort((a, b) =>
      a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : a.rank - b.rank,
    );
  }

  get deliveryCount(): number {
    return this.known.length;
  }

  /**
   * Une clôture (ou sa réannonce) reçue : ses livraisons rejoignent
   * l'ensemble, et l'instant d'arrêt se pose s'il manquait.
   *
   * @returns ce qu'il y a à ANNONCER : à la première clôture reçue, tout
   *   l'ensemble — y compris ce qu'un retirage arrivé avant elle avait déjà
   *   rangé ; ensuite, les seules livraisons qui n'étaient pas encore connues.
   */
  learnClosure(closedAt: Date, shipments: readonly ShipmentRef[], at: Date): number {
    const wasArrested = this.closed !== null;
    const added = this.union(shipments, at);
    this.closed ??= closedAt;
    return wasArrested ? added : this.known.length;
  }

  /**
   * Un retirage reçu (CA6b) : ses livraisons absorbées rejoignent l'ensemble.
   * Aucun ordre n'est supposé : arrivé avant la clôture, il range sans poser
   * d'instant d'arrêt.
   *
   * @returns ce qu'il y a à ANNONCER : les livraisons nouvelles si le plan est
   *   déjà arrêté ; rien sinon — la clôture, quand elle arrivera, annoncera
   *   le total, celles-ci comprises.
   */
  learnRetake(shipments: readonly ShipmentRef[], at: Date): number {
    const added = this.union(shipments, at);
    return this.closed === null ? 0 : added;
  }

  /**
   * Une réouverture reçue : le plan arrêté est oublié — instant d'arrêt et
   * ensemble. L'abonné ne l'appelle que si la journée n'a pas été arrêtée de
   * nouveau depuis : c'est lui qui sait le demander au fournil.
   */
  forgetClosure(at: Date): void {
    this.closed = null;
    this.known = [];
    this.touchedAt = at;
  }

  private union(shipments: readonly ShipmentRef[], at: Date): number {
    const before = this.known.length;
    for (const shipment of shipments) {
      if (!this.known.some((known) => known.equals(shipment))) {
        this.known = [...this.known, shipment];
      }
    }
    this.touchedAt = at;
    return this.known.length - before;
  }
}
