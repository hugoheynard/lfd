import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CANCELLED_SUBSCRIPTION } from "../domain/entities/subscription.js";
import { RecurringOccurrences } from "../domain/ports/recurring-occurrences.js";
import {
  servableOccurrence,
  type ServableOccurrence,
  type UnservableOccurrence,
} from "../domain/services/servable-occurrence.js";
import type { IsoDate } from "../domain/value-objects/iso-date.js";
import { SUBSCRIPTION_INCLUDE, subscriptionFromRow } from "./prisma-subscription.repository.js";

/** Adaptateur Prisma : charge le panier sans mur de personne, et le laisse décider. */
@Injectable()
export class PrismaRecurringOccurrences extends RecurringOccurrences {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async occurrenceOn(
    subscriptionId: string,
    date: IsoDate,
  ): Promise<ServableOccurrence | UnservableOccurrence> {
    const row = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, status: { not: CANCELLED_SUBSCRIPTION } },
      include: SUBSCRIPTION_INCLUDE,
    });
    if (row === null) {
      return { kind: "not_due" };
    }
    return servableOccurrence(subscriptionFromRow(row), subscriptionId, date);
  }
}
