import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import {
  UnsettledShopOrderExpiry,
  type UnsettledShopOrderExpiryReport,
} from "../services/unsettled-shop-order-expiry.service.js";
import { ExpireUnsettledShopOrdersCommand } from "./expire-unsettled-shop-orders.command.js";

/**
 * Le passage du cron. Idempotent : l'écriture est conditionnée en base, un
 * second passage ne trouve plus ce que le premier a annulé.
 */
@CommandHandler(ExpireUnsettledShopOrdersCommand)
export class ExpireUnsettledShopOrdersHandler implements ICommandHandler<
  ExpireUnsettledShopOrdersCommand,
  UnsettledShopOrderExpiryReport
> {
  constructor(private readonly expiry: UnsettledShopOrderExpiry) {}

  execute(): Promise<UnsettledShopOrderExpiryReport> {
    return this.expiry.expireLapsed();
  }
}
