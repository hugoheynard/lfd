import { QuoteOrderQuery } from "../application/queries/quote-order.handler.js";
import {
  type ClientSheet,
  type OrderView,
  type PlaceOrderPayload,
  placeOrderPayloadSchema,
  type OrderPaymentIntent,
  type PlacedOrderResponse,
  orderQuotePayloadSchema,
  type OrderQuotePayload,
  type CustomerOrderQuoteView,
  type OrderQuoteView,
  toCustomerQuote,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import type { Response } from "express";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  PlaceOrderCommand,
  type PlaceOrderResult,
} from "../application/commands/place-order.command.js";
import { GetOrderPaymentQuery } from "../application/queries/get-order-payment.query.js";
import { GetOrderQuery } from "../application/queries/get-order.query.js";
import { GetOrderSheetQuery } from "../application/queries/get-order-sheet.query.js";
import type { OrderSheetPdf } from "../application/services/order-sheet-archive.service.js";
import { GetOrderSheetPdfQuery } from "../application/queries/get-order-sheet-pdf.query.js";
import { ListPersonalOrdersQuery } from "../application/queries/list-personal-orders.query.js";

/**
 * Commandes du **client connecté** — **zéro friction**.
 *
 * `POST /orders` passe une commande : l'entreprise est **optionnelle** (dans le
 * corps). Sans entreprise, la commande n'appartient qu'au client (mur =
 * `Principal.userId`) et se règle par carte ; avec une entreprise, le handler
 * exige d'en être **membre** (le `companyId` du corps, jamais un rôle du corps).
 * L'`userId` vient toujours du `Principal` ; les prix sont ré-résolus au serveur.
 */
@Controller("orders")
export class OrdersController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Passe une commande (personnelle, ou pour une entreprise dont on est membre). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async place(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(placeOrderPayloadSchema)) payload: PlaceOrderPayload,
    // 🔴 La société vient du CONTEXTE, jamais du corps : le client ne peut pas
    // en nommer une autre, et il n'a donc pas à être cru sur parole.
    @ActingCompany() companyId: string | null,
  ): Promise<PlacedOrderResponse> {
    const placed = await this.commands.execute<PlaceOrderCommand, PlaceOrderResult>(
      new PlaceOrderCommand(user.userId, payload, companyId),
    );
    // `payment` n'est présent que si une carte est requise (pas d'entreprise, ou
    // entreprise non active / per_order) ; on ne l'ajoute que dans ce cas
    // (exactOptionalPropertyTypes).
    return placed.payment === undefined
      ? { id: placed.id, orderNumber: placed.orderNumber }
      : { id: placed.id, orderNumber: placed.orderNumber, payment: placed.payment };
  }

  /**
   * **Ce que la commande coûtera**, avant de la passer.
   *
   * Le panier du client affichait le tarif de son catalogue embarqué pendant que
   * le serveur facturait le prix résolu — mercuriale de sa société, palier de
   * volume atteint, promotion en cours. Il voyait donc un montant, et en payait
   * un autre.
   *
   * Le `companyId` du CORPS est muré exactement comme sur `POST /orders` : le
   * client doit en être membre. Un devis rend un prix négocié ; sans ce mur, on
   * sonderait la mercuriale d'un concurrent en devinant son identifiant.
   *
   * 🔴 **Et la réponse est RÉTRÉCIE.** Ce mur-ci protège la mercuriale d'un
   * concurrent ; il ne protégeait pas la machinerie qui fabrique nos prix contre
   * le client lui-même. La route rendait `OrderQuoteView` en entier — donc
   * `steps` (l'identifiant et le **libellé commercial** de chaque règle, plus
   * les rivales qu'elle a évincées), `sealedByRuleId`, `sealedRuleIds`,
   * `floorMillicents` (le plancher, c'est-à-dire la marge) et `floored`.
   *
   * Aucun front client ne l'appelait ; la route, elle, était ouverte à qui porte
   * un jeton. Le rétrécissement passe par une conversion explicite, pas par un
   * type plus étroit : TypeScript accepte le surplus dès que l'objet n'est pas
   * un littéral, et un champ ajouté demain à la vue staff fuirait sans qu'une
   * ligne rougisse.
   */
  @Post("quote")
  @HttpCode(HttpStatus.OK)
  async quote(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(orderQuotePayloadSchema)) payload: OrderQuotePayload,
  ): Promise<CustomerOrderQuoteView> {
    return toCustomerQuote(
      await this.queries.execute<QuoteOrderQuery, OrderQuoteView>(
        new QuoteOrderQuery(user.userId, payload, false),
      ),
    );
  }

  /** Liste les commandes **personnelles** du client (sans entreprise). */
  @Get("mine")
  async mine(@CurrentUser() user: Principal): Promise<readonly OrderView[]> {
    return this.queries.execute<ListPersonalOrdersQuery, readonly OrderView[]>(
      new ListPersonalOrdersQuery(user.userId),
    );
  }

  /**
   * Une commande, si le demandeur a le droit de la voir : la sienne (personnelle),
   * ou celle d'une entreprise dont il est membre. Sinon **404**, sans distinguer
   * l'inexistante de l'interdite.
   *
   * Déclarée **après** `mine` : Nest apparie dans l'ordre de déclaration, et
   * `:id` avalerait sinon le mot `mine`.
   */
  @Get(":id")
  async one(@CurrentUser() user: Principal, @Param("id") id: string): Promise<OrderView> {
    return this.queries.execute<GetOrderQuery, OrderView>(new GetOrderQuery(user.userId, id));
  }

  /**
   * Le **bon de commande**, tel que le client le lit : ses montants, les
   * libellés des gestes tarifaires, l'acheminement convenu.
   *
   * 🔴 **La route ne prend pas d'audience.** Elle sert la feuille CLIENT et rien
   * d'autre — un paramètre laisserait le demandeur choisir, et `audience=staff`
   * lui rendrait les SKU et la trace du prix. La projection existe pour retenir
   * ça ; lui en confier le choix la rendrait décorative.
   *
   */
  @Get(":id/bon")
  async bon(@CurrentUser() user: Principal, @Param("id") id: string): Promise<ClientSheet> {
    return this.queries.execute<GetOrderSheetQuery, ClientSheet>(
      new GetOrderSheetQuery(user.userId, id),
    );
  }

  /**
   * Le bon de commande **en PDF** — l'exemplaire qu'on garde et qu'on imprime.
   *
   * Il est **rangé au premier téléchargement** et rendu tel quel ensuite : le
   * papier parti du comptoir est un fait, et un avenant ne doit pas réécrire ce
   * que le client a dans la poche.
   *
   * Même mur que la lecture. Et aucun QR dessus — le jeton n'est pas sur la
   * feuille, donc ce chemin ne peut pas l'imprimer.
   */
  @Get(":id/bon.pdf")
  async bonPdf(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetOrderSheetPdfQuery, OrderSheetPdf>(
      new GetOrderSheetPdfQuery(user.userId, id),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(pdf.fileName, "bon-de-commande.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }

  /**
   * De quoi **régler** une commande laissée en attente — la cible du lien que
   * l'équipe transmet quand elle a saisi une commande au téléphone.
   *
   * Même mur que la lecture : qui peut voir la commande peut la payer. Un `409`
   * si elle n'attend rien (déjà réglée, portée au compte), et non un `404` — le
   * client doit apprendre que sa commande va bien, pas qu'elle a disparu.
   */
  @Get(":id/payment")
  async payment(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
  ): Promise<OrderPaymentIntent> {
    return this.queries.execute<GetOrderPaymentQuery, OrderPaymentIntent>(
      new GetOrderPaymentQuery(user.userId, id),
    );
  }
}
