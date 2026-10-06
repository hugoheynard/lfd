import { Injectable } from "@nestjs/common";

import { DepartureHoldsReader } from "../../../delivery/channels/handover/index.js";
import { QualityHoldsReader } from "../../../production/channels/handover/index.js";
import { HandoverSubjectReader } from "../../channels/commerce/handover-subject.reader.js";

/**
 * **« Lesquelles sont retenues ? »**, demandé par la livraison au départ
 * (`a-la-porte.md`, § 10 ter, BQ) — répondu comme au comptoir
 * (`isHeldForQuality`) : la retenue se lit au jour demandé de la commande, sur
 * le port que la production publie.
 *
 * Les commandes sont regroupées par jour : une question au fournil par jour,
 * pas par commande. Une commande sans jour demandé, ou que le commerce ne sert
 * plus, n'est dans aucun plan — aucune retenue ne peut la viser.
 */
@Injectable()
export class HandoverDepartureHolds extends DepartureHoldsReader {
  constructor(
    private readonly subjects: HandoverSubjectReader,
    private readonly holds: QualityHoldsReader,
  ) {
    super();
  }

  async heldOrders(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    const byDay = await this.groupByDay(orderIds);
    const answers = await Promise.all(
      [...byDay].map(([day, ids]) => this.holds.heldOrders(day, ids)),
    );
    return new Set(answers.flatMap((held) => [...held]));
  }

  private async groupByDay(orderIds: readonly string[]): Promise<Map<string, string[]>> {
    const subjects = await Promise.all(orderIds.map((id) => this.subjects.byOrderId(id)));
    const byDay = new Map<string, string[]>();
    for (const subject of subjects) {
      if (subject === null || subject.requestedDeliveryDate === null) {
        continue;
      }
      const day = subject.requestedDeliveryDate.toISOString().slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), subject.orderId]);
    }
    return byDay;
  }
}
