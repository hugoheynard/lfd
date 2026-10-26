import { ordersOpenTo, type AcceptedSalesTerms, type CustomerAudience } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { admitsOrder } from "../../../order-opening/domain/order-admission.js";
import { ActiveOrderOpeningExemptions } from "../../../order-opening/domain/ports/active-order-opening-exemptions.reader.js";
import { OrderOpeningReader } from "../../../order-opening/domain/ports/order-opening.reader.js";
import { OrdersClosedForAudienceError } from "../../domain/errors/orders-closed-for-audience.error.js";
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
}

/**
 * **La boutique prend-elle cette commande ?** — le réglage « Ouverture de la
 * boutique » appliqué à la clientèle de qui commande, puis, s'il la ferme,
 * les exemptions (décision de Hugo du 2026-10-26).
 *
 * Appelé par les deux passations CLIENT seulement (`PlaceOrderHandler`,
 * `PlaceShopOrderHandler`), et jamais par `OrderDrafting` : la composition est
 * partagée avec la saisie du staff (`PlaceOrderForCustomerHandler`), que la
 * fermeture ne bloque PAS — l'équipe qui prend une commande au téléphone doit
 * pouvoir la saisir boutique fermée (Hugo, 2026-10-09).
 *
 * La clientèle se déduit par {@link CustomerAudiences}, la même règle que la
 * remise et la livraison : B2B pour une société active seulement. La décision
 * elle-même est {@link admitsOrder}, pure ; ce service ne fait que lire.
 */
@Injectable()
export class OrderIntake {
  constructor(
    private readonly opening: OrderOpeningReader,
    private readonly audiences: CustomerAudiences,
    private readonly exemptions: ActiveOrderOpeningExemptions,
    private readonly recipients: OrderRecipientReader,
    private readonly salesTerms: OrderSalesTermsReader,
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
   * @throws {OrdersClosedForAudienceError} cf. {@link ensureOpenFor}.
   * @throws {SalesTermsOutdatedError} la case ne porte pas la version en vigueur.
   */
  async admit(
    companyId: string | null,
    buyer: IntakeBuyer,
    accepted: AcceptedSalesTerms | null,
  ): Promise<void> {
    const audience = await this.openAudienceOf(companyId, buyer);
    const document = salesTermsOf(audience);
    const { revision } = await this.salesTerms.inForce(document);
    ensureSalesTermsAccepted(accepted, document, revision);
  }

  /**
   * `companyId` `null` = espace perso ou commande sans compte : particulier.
   *
   * @throws {OrdersClosedForAudienceError} la boutique est fermée à cette
   *   clientèle, et aucune exemption ne couvre ni la société ni l'adresse.
   */
  async ensureOpenFor(companyId: string | null, buyer: IntakeBuyer): Promise<void> {
    await this.openAudienceOf(companyId, buyer);
  }

  /** La clientèle de qui commande, si la boutique la prend ; sinon le refus. */
  private async openAudienceOf(
    companyId: string | null,
    buyer: IntakeBuyer,
  ): Promise<CustomerAudience> {
    const standing = await this.standingFor(companyId, buyer);
    if (!standing.canOrder) {
      throw new OrdersClosedForAudienceError(standing.audience);
    }
    return standing.audience;
  }

  /**
   * La même décision, sans refus : ce que la boutique demande AVANT de montrer
   * un bouton de commande (2026-10-26). Une seule règle pour les deux, donc
   * l'écran ne peut pas promettre ce que la passation refuserait.
   *
   * Ouverte : ni la liste ni l'adresse ne sont lues — c'est le cas de chaque
   * passation tant que personne n'a rien fermé.
   */
  async standingFor(companyId: string | null, buyer: IntakeBuyer): Promise<IntakeStanding> {
    const audience = await this.audiences.of(companyId);
    const opening = await this.opening.current();
    if (ordersOpenTo(opening, audience)) {
      return { audience, ordersOpen: true, canOrder: true };
    }
    const party = { companyId, email: await this.emailOf(buyer) };
    const exemptions = await this.exemptions.active();
    return {
      audience,
      ordersOpen: false,
      canOrder: admitsOrder({ opening, audience, exemptions, party }),
    };
  }

  private async emailOf(buyer: IntakeBuyer): Promise<string | null> {
    if ("email" in buyer) {
      return buyer.email;
    }
    return (await this.recipients.findById(buyer.userId))?.email ?? null;
  }
}
