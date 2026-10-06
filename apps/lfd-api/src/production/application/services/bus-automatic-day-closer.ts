import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { Actor } from "../../../platform/context/request-context.js";
import {
  currentRequestContext,
  runWithRequestContext,
} from "../../../platform/context/request-context.store.js";
import { newTraceId } from "../../../platform/context/trace-context.js";
import { Clock } from "../../../platform/time/clock.js";
import { AutomaticDayCloser } from "../../domain/ports/automatic-day-closer.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { CloseProductionDayCommand } from "../commands/close-production-day.command.js";

/**
 * L'auteur de l'arrêt automatique (S7) : le système, nommé. La route machine
 * pose `recompute-cron` pour toute la requête (`RecomputeGuard`) ; l'arrêt,
 * lui, dit qui il est.
 */
export const AUTO_CLOSE_ACTOR: Actor = { type: "system", id: "auto-close" };

/**
 * La VRAIE clôture, par le bus, dans un contexte de requête dont l'acteur est
 * {@link AUTO_CLOSE_ACTOR} — pour la seule durée de l'arrêt : le journal
 * (`production_day.closed`) écrit cet acteur, et la charge porte
 * `automatic: true`. Même instant et même trace que le tour qui l'appelle.
 */
@Injectable()
export class BusAutomaticDayCloser extends AutomaticDayCloser {
  constructor(
    private readonly commands: CommandBus,
    private readonly clock: Clock,
  ) {
    super();
  }

  async close(day: ServiceDay): Promise<void> {
    const seed = {
      now: this.clock.now(),
      traceId: currentRequestContext()?.traceId ?? newTraceId(),
      actor: AUTO_CLOSE_ACTOR,
    };
    await runWithRequestContext(seed, () =>
      this.commands.execute(new CloseProductionDayCommand(day.value, "automatic")),
    );
  }
}
