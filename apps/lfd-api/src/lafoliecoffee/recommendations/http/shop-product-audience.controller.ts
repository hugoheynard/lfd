import { productAudienceBatchSchema, type ProductAudienceBatchPayload } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecordProductAudienceCommand } from "../application/commands/record-product-audience.command.js";
import { BeaconBody } from "./beacon-body.pipe.js";

/**
 * **La mesure d'audience de la boutique** — un lot de gestes, sans jeton.
 *
 * Publique comme le catalogue : on compte ce que regarde un visiteur qui n'a
 * pas de compte. Rien n'y désigne quelqu'un, et l'IP ne sert qu'au throttle.
 *
 * Contre le gonflement, trois bornes et pas de système anti-abus : le
 * coupe-flood de la passerelle de l'API (300/min/IP, `wrangler.jsonc`), ce
 * throttle resserré (30 lots/min/IP, soit 1 500 gestes au plus), et le lot
 * lui-même — 50 gestes, SKU servis, gestes de l'énumération. Un compteur
 * gonflé à la main reste possible dans ces bornes : c'est une mesure
 * d'audience, pas une donnée qui facture.
 */
@Controller("shop/audience")
@Public()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class ShopProductAudienceController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  record(
    @Body(new BeaconBody(productAudienceBatchSchema)) payload: ProductAudienceBatchPayload,
  ): Promise<void> {
    return this.commands.execute<RecordProductAudienceCommand, void>(
      new RecordProductAudienceCommand(payload.events),
    );
  }
}
