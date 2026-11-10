import type { Instant } from "../../../../platform/context/request-context.js";
import {
  instantToLocal,
  ordersOpenTo,
  type AcceptedSalesTerms,
  type CustomerAudience,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import {
  admitsOrder,
  admitsServiceDay,
  firstServiceDayFor,
  firstServiceDayOfAudience,
} from "../../../order-opening/domain/order-admission.js";
import { ActiveOrderOpeningExemptions } from "../../../order-opening/domain/ports/active-order-opening-exemptions.reader.js";
import { OrderOpeningReader } from "../../../order-opening/domain/ports/order-opening.reader.js";
import { OrdersClosedForAudienceError } from "../../domain/errors/orders-closed-for-audience.error.js";
import { ServiceDayBeforeFirstOrderableDayError } from "../../domain/errors/service-day-before-first-orderable-day.error.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderSalesTermsReader } from "../../domain/ports/order-sales-terms.reader.js";
import { ensureSalesTermsAccepted } from "../../domain/services/sales-terms-acceptance.js";
import { salesTermsOf } from "../../domain/services/sales-terms-of.js";
import { CustomerAudiences } from "./customer-audiences.service.js";

/**
 * Qui commande, tel que la passation le connaît : la personne connectée (son
 * adresse se lit au besoin), ou l'adresse saisie d'une commande sans compte.
 */
export type IntakeBuyer = { readonly userId: string } | { readonly email: string };

/**
 * Ce que la porte sait de qui commande : sa clientèle, si la boutique lui est
 * ouverte, et si sa passation serait prise (exemptions comprises).
 */
export interface IntakeStanding {
  readonly audience: CustomerAudience;
  readonly ordersOpen: boolean;
  readonly canOrder: boolean;
  /**
   * Le premier jour de service qu'elle peut commander, ou `null` : pas de
   * date pour sa clientèle, date atteinte, ou exemption (2026-10-28).
   */
  readonly firstServiceDay: string | null;
}

/**
 * **La boutique prend-elle cette commande ?** — le réglage « Ouverture de la
 * boutique » appliqué à la clientèle de qui commande, puis, s'il la ferme,
 * les exemptions (décision de Hugo du 2026-10-26).
 *
 * Appelé par les deux passations CLIENT (`PlaceOrderHandler`,
 * `PlaceShopOrderHandler`) et, depuis le 2026-11-03, par la saisie de
 * l'équipe et son estimation ({@link admitStaffEntry}) — jamais par
 * `OrderDrafting`. La saisie de l'équipe passait outre la fermeture (Hugo,
 * 2026-10-09) ; Hugo l'a alignée sur le client le 2026-11-03 (E2 du plan
 * `documentation/pricing/saisie/plan-prix-de-la-saisie.md`) : « comme s'il
 * commandait lui-même », et une exception passe par une exemption, pas par
 * l'équipe.
 *
 * La clientèle se déduit par {@link CustomerAudiences}, la même règle que la
 * remise et la livraison : B2B pour une société active seulement. La décision
 * elle-même est {@link admitsOrder}, pure ; ce service ne fait que lire.
 *
 * Depuis le 2026-10-28, la même porte tient le **premier jour commandable**
 * de la clientèle (`plan-premier-jour-commandable.md`) : une journée plus tôt
 * est refusée, sauf exemption — l'équipe comprise depuis le 2026-11-03 (E2).
 */
@Injectable()
export class OrderIntake {
  constructor(
    private readonly opening: OrderOpeningReader,
    private readonly audiences: CustomerAudiences,
    private readonly exemptions: ActiveOrderOpeningExemptions,
    private readonly recipients: OrderRecipientReader,
    private readonly salesTerms: OrderSalesTermsReader,
    private readonly clock: Clock,
  ) {}

  /**
   * **La porte entière d'une passation client** : la boutique ouverte à cette
   * clientèle, puis les CGV cochées au panier (2026-10-26), confrontées au
   * texte en vigueur pour la MÊME audience — celle qui tarifera la commande.
   *
   * Les deux refus tombent avant toute composition : l'appelant rend sa clé
   * d'idempotence, et un rejeu d'une commande déjà passée n'arrive jamais ici.
   * La version figée sur la commande reste celle que `OrderDrafting` résout ;
   * elle est celle qu'on vient d'admettre, au délai d'une publication près.
   *
   * Puis la journée demandée, qui ne précède pas le premier jour commandable
   * de la clientèle (2026-10-28) — après l'ouverture : boutique fermée, c'est
   * la fermeture qu'on dit.
   *
   * @throws {OrdersClosedForAudienceError} cf. {@link ensureOpenFor}.
   * @throws {ServiceDayBeforeFirstOrderableDayError} cf. {@link ensureServiceDayFor}.
   * @throws {SalesTermsOutdatedError} la case ne porte pas la version en vigueur.
   */
  async admit(
    companyId: string | null,
    buyer: IntakeBuyer,
    accepted: AcceptedSalesTerms | null,
    serviceDay: string | null,
  ): Promise<void> {
    const standing = await this.openStandingOf(companyId, buyer);
    ensureDayAdmitted(standing, serviceDay);
    const document = salesTermsOf(standing.audience);
    const { revision } = await this.salesTerms.inForce(document);
    ensureSalesTermsAccepted(accepted, document, revision);
  }

  /**
   * **La porte de la saisie de l'équipe** (E2, Hugo, 2026-11-03) : la boutique
   * ouverte à la clientèle du client porté, puis son premier jour commandable
   * — exemptions comprises, sur la société et l'adresse de l'ACHETEUR. Sans
   * les CGV : le client ne coche rien quand l'équipe saisit pour lui, et
   * celles qui s'appliquent se figent sur la commande comme avant.
   *
   * @throws {OrdersClosedForAudienceError} cf. {@link ensureOpenFor}.
   * @throws {ServiceDayBeforeFirstOrderableDayError} cf. {@link ensureServiceDayFor}.
   */
  async admitStaffEntry(
    companyId: string,
    buyer: IntakeBuyer,
    serviceDay: string | null,
  ): Promise<void> {
    ensureDayAdmitted(await this.openStandingOf(companyId, buyer), serviceDay);
  }

  /**
   * `companyId` `null` = espace perso ou commande sans compte : particulier.
   *
   * @throws {OrdersClosedForAudienceError} la boutique est fermée à cette
   *   clientèle, et aucune exemption ne couvre ni la société ni l'adresse.
   */
  async ensureOpenFor(companyId: string | null, buyer: IntakeBuyer): Promise<void> {
    await this.openStandingOf(companyId, buyer);
  }

  /**
   * **La journée seule** — ce que la révision d'une commande par son client
   * oppose quand la date change (2026-10-28). La fermeture n'y joue pas : une
   * commande déjà passée se modifie boutique fermée, comme elle s'annule.
   * `at` : l'instant du geste (plan S2, R6) — l'horloge pour M1.
   *
   * @throws {ServiceDayBeforeFirstOrderableDayError} la journée précède le
   *   premier jour commandable de la clientèle, et aucune exemption ne couvre
   *   ni la société ni l'adresse.
   */
  async ensureServiceDayFor(
    companyId: string | null,
    buyer: IntakeBuyer,
    serviceDay: string | null,
    at: Instant,
  ): Promise<void> {
    ensureDayAdmitted(await this.standingFor(companyId, buyer, at), serviceDay);
  }

  /** Ce que la porte sait de qui commande, si la boutique la prend ; sinon le refus. */
  private async openStandingOf(
    companyId: string | null,
    buyer: IntakeBuyer,
  ): Promise<IntakeStanding> {
    const standing = await this.standingFor(companyId, buyer);
    if (!standing.canOrder) {
      throw new OrdersClosedForAudienceError(standing.audience);
    }
    return standing;
  }

  /**
   * La même décision, sans refus : ce que la boutique demande AVANT de montrer
   * un bouton de commande (2026-10-26). Une seule règle pour les deux, donc
   * l'écran ne peut pas promettre ce que la passation refuserait.
   *
   * Ouverte et sans premier jour à venir : ni la liste ni l'adresse ne sont
   * lues — c'est le cas de chaque passation tant que personne n'a rien réglé.
   */
  async standingFor(
    companyId: string | null,
    buyer: IntakeBuyer,
    at: Instant = this.clock.now(),
  ): Promise<IntakeStanding> {
    const audience = await this.audiences.of(companyId);
    const opening = await this.opening.current();
    const today = instantToLocal(at).day;
    const ordersOpen = ordersOpenTo(opening, audience);
    const first = firstServiceDayOfAudience(opening, audience);
    if (ordersOpen && (first === null || first <= today)) {
      return { audience, ordersOpen, canOrder: true, firstServiceDay: null };
    }
    const party = { companyId, email: await this.emailOf(buyer) };
    const exemptions = await this.exemptions.active();
    return {
      audience,
      ordersOpen,
      canOrder: admitsOrder({ opening, audience, exemptions, party }),
      firstServiceDay: firstServiceDayFor({ opening, audience, exemptions, party, today }),
    };
  }

  private async emailOf(buyer: IntakeBuyer): Promise<string | null> {
    if ("email" in buyer) {
      return buyer.email;
    }
    return (await this.recipients.findById(buyer.userId))?.email ?? null;
  }
}

/** @throws {ServiceDayBeforeFirstOrderableDayError} la journée précède le premier jour de la personne. */
function ensureDayAdmitted(standing: IntakeStanding, serviceDay: string | null): void {
  if (
    standing.firstServiceDay !== null &&
    !admitsServiceDay(standing.firstServiceDay, serviceDay)
  ) {
    throw new ServiceDayBeforeFirstOrderableDayError(standing.audience, standing.firstServiceDay);
  }
}
