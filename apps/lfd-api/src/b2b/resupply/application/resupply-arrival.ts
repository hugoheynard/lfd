import { Injectable } from "@nestjs/common";

import { ResupplyReceptions } from "../domain/resupply-receptions.js";
import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";
import type { SiteResupply } from "../domain/site-resupply.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import type { ResupplyTrace } from "../domain/resupply-trace.js";
import { ResupplyArrivedBell } from "./resupply-arrived-bell.js";

/**
 * **« Il est là », la séquence commune** (R3e) — « Monté » au fournil et la
 * réception du transfert la recopiaient chacun (audit final, 2026-11-03) :
 * la réception lue, le geste de l'agrégat, l'écriture sous la version s'il
 * a changé quelque chose, puis la cloche, une lecture de nom de point pour
 * tous les arrivés. La RÈGLE reste dans l'agrégat (`markArrived`,
 * `markMounted`) : ce service ne fait qu'enchaîner. À appeler dans l'unité
 * de travail de l'appelant.
 */
@Injectable()
export class ResupplyArrival {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly receptions: ResupplyReceptions,
    private readonly labels: ResupplySiteLabels,
    private readonly bell: ResupplyArrivedBell,
  ) {}

  /**
   * Lit la réception, laisse `gesture` décider, et sauve si le réassort vient
   * d'arriver. Rend `true` alors — l'appelant le fait sonner.
   */
  async mark(
    resupply: SiteResupply,
    gesture: (reception: ResupplyTrace | null) => boolean,
  ): Promise<boolean> {
    const reception = await this.receptions.receptionOf(resupply.siteId, resupply.id);
    if (!gesture(reception)) {
      return false;
    }
    await this.resupplies.save(resupply);
    return true;
  }

  /** La cloche de chaque réassort arrivé au point, le nom du point lu une fois. */
  async ring(siteId: string, arrived: readonly SiteResupply[], at: Date): Promise<void> {
    if (arrived.length === 0) {
      return;
    }
    const label = (await this.labels.labelsOf([siteId])).get(siteId) ?? null;
    for (const resupply of arrived) {
      this.bell.ring(resupply, label, at);
    }
  }
}
