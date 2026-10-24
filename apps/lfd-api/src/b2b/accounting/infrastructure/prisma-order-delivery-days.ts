import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderDeliveryDays } from "../domain/ports/order-delivery-days.js";

/** `orders.received_on`, posée par une écriture conditionnée — la base arbitre. */
@Injectable()
export class PrismaOrderDeliveryDays extends OrderDeliveryDays {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recordFirst(orderId: string, day: string): Promise<boolean> {
    // `@db.Date` : minuit UTC du jour, dont la date ISO EST le jour de Paris.
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, receivedOn: null },
      data: { receivedOn: new Date(`${day}T00:00:00.000Z`) },
    });
    return count === 1;
  }
}
