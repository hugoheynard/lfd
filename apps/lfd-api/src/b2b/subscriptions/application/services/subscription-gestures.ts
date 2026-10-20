import { Injectable } from "@nestjs/common";

import type {
  GestureStatus,
  SiteGestureType,
} from "../../../account/domain/events/site-gesture.fact.js";
import { CompanyNameReader } from "../../../account/domain/ports/company-name.reader.js";
import { MembershipReader } from "../../../account/domain/ports/membership.reader.js";
import { SiteGesturePublisher } from "../../../account/application/services/site-gesture.publisher.js";
import type { Subscription } from "../../domain/entities/subscription.js";
import {
  SubscriptionNotFoundError,
  SubscriptionSiteMembershipLostError,
} from "../../domain/errors/subscription-errors.js";
import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";

/** Un geste sur un panier, tel qu'il s'annonce au principal du site. */
export interface SubscriptionGesture {
  readonly type: SiteGestureType;
  readonly subscription: Subscription;
  readonly subscriptionId: string;
  readonly actorUserId: string;
  readonly status?: GestureStatus;
}

/**
 * **Le mur et l'annonce des gestes sur un panier récurrent**
 * (`plan-notifications-sous-comptes.md`, N4e) — partagés par les handlers du
 * contexte, qui n'en diffèrent que par la mutation.
 *
 * - Le mur : le panier est à la personne (`load`), ET, s'il est d'une
 *   société, la personne en est membre ACTUEL — sans quoi quelqu'un qui a
 *   quitté la société garderait la main sur le panier du site.
 * - L'annonce : un fait durable par geste, dans l'unité de travail de
 *   l'appelant, pour la société COPIÉE sur le panier. Un panier sans société
 *   (perso, ou d'avant la colonne) n'a pas de site : rien à annoncer.
 */
@Injectable()
export class SubscriptionGestures {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly memberships: MembershipReader,
    private readonly names: CompanyNameReader,
    private readonly gestures: SiteGesturePublisher,
  ) {}

  /**
   * @throws {SubscriptionNotFoundError} inconnu, ou pas à cette personne.
   * @throws {SubscriptionSiteMembershipLostError} panier d'une société que la personne a quittée.
   */
  async loadManaged(subscriptionId: string, actorUserId: string): Promise<Subscription> {
    const subscription = await this.subscriptions.load(subscriptionId, actorUserId);
    if (subscription === null) {
      throw new SubscriptionNotFoundError(subscriptionId);
    }
    await this.ensureMember(subscription.companyId, actorUserId);
    return subscription;
  }

  /** @throws {SubscriptionSiteMembershipLostError} la personne n'est pas membre actuel de la société. */
  async ensureMember(companyId: string | null, actorUserId: string): Promise<void> {
    if (companyId === null) {
      return;
    }
    if ((await this.memberships.roleOf(actorUserId, companyId)) === null) {
      const name = (await this.names.nameOf(companyId)) ?? companyId;
      throw new SubscriptionSiteMembershipLostError(companyId, name);
    }
  }

  /** À appeler DANS l'unité de travail du geste. */
  async announce(gesture: SubscriptionGesture): Promise<void> {
    const companyId = gesture.subscription.companyId;
    if (companyId === null) {
      return;
    }
    const name = (await this.names.nameOf(companyId)) ?? companyId;
    await this.gestures.publish({
      type: gesture.type,
      site: { id: companyId, name },
      subjectId: gesture.subscriptionId,
      actor: { kind: "customer", userId: gesture.actorUserId },
      ...(gesture.status === undefined ? {} : { status: gesture.status }),
    });
  }
}
