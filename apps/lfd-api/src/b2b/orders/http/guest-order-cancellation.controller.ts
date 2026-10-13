import {
  type GuestCancellationConfirmPayload,
  guestCancellationConfirmPayloadSchema,
  type GuestCancellationViewPayload,
  guestCancellationViewPayloadSchema,
  type GuestOrderCancellationView,
} from "@lfd/contracts";
import { Body, Controller, Header, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CancelGuestOrderCommand } from "../application/commands/cancel-guest-order.command.js";
import { GetGuestOrderCancellationQuery } from "../application/queries/get-guest-order-cancellation.query.js";

/**
 * **L'annulation par l'invité, depuis le lien de son courriel** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.4).
 *
 * Surface PUBLIQUE, dans un contrôleur À PART (S6) : son débit est le sien,
 * pas le seau de `POST /shop/orders` — 20/min/IP pour lire, 5/min/IP pour
 * annuler. Le jeton voyage dans le fragment de l'URL (`/annuler#<id>.<jeton>`,
 * S7), que le navigateur n'envoie jamais ; la page le lit et le met dans le
 * CORPS de ces deux `POST`. Aucun jeton dans un chemin, aucune annulation sur
 * un `GET` (les scanners de liens des messageries les suivent tous).
 *
 * - `POST view` `{ orderId, token }` → `200` `GuestOrderCancellationView` —
 *   annulable ou non, la page dit pourquoi ; `404` neutre (« lien introuvable
 *   ou trop ancien ») pour un jeton faux, une commande inconnue, d'une société,
 *   ou de plus de 90 jours.
 * - `POST confirm` `{ orderId, token, reasonCode?, reasonText? }` → `204` ;
 *   refus `409` `orders.customer_cancel.*` avec la phrase client ; même `404`.
 *
 * `no-store`, `noindex` et `Referrer-Policy: no-referrer` sur les deux.
 */
@Controller("shop/orders/cancellation")
@Public()
export class GuestOrderCancellationController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Post("view")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  @Header("X-Robots-Tag", "noindex")
  @Header("Referrer-Policy", "no-referrer")
  view(
    @Body(new ZodBody(guestCancellationViewPayloadSchema)) payload: GuestCancellationViewPayload,
  ): Promise<GuestOrderCancellationView> {
    return this.queries.execute<GetGuestOrderCancellationQuery, GuestOrderCancellationView>(
      new GetGuestOrderCancellationQuery(payload.orderId, payload.token),
    );
  }

  @Post("confirm")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  @Header("X-Robots-Tag", "noindex")
  @Header("Referrer-Policy", "no-referrer")
  async confirm(
    @Body(new ZodBody(guestCancellationConfirmPayloadSchema))
    payload: GuestCancellationConfirmPayload,
  ): Promise<void> {
    await this.commands.execute<CancelGuestOrderCommand, void>(
      new CancelGuestOrderCommand(
        payload.orderId,
        payload.token,
        payload.reasonCode,
        payload.reasonText,
      ),
    );
  }
}
