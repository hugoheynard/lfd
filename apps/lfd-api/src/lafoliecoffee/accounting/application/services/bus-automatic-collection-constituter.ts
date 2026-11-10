import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { Actor } from "../../../../platform/context/request-context.js";
import {
  currentRequestContext,
  runWithRequestContext,
} from "../../../../platform/context/request-context.store.js";
import { newTraceId } from "../../../../platform/context/trace-context.js";
import { Clock } from "../../../../platform/time/clock.js";
import { AutomaticCollectionConstituter } from "../../domain/ports/automatic-collection-constituter.js";
import { ConstituteCollectionBatchesCommand } from "../commands/constitute-collection-batches.command.js";

/**
 * L'acteur de la constitution automatique (PA3) : le système, nommé. La
 * route machine pose `recompute-cron` pour toute la requête
 * (`RecomputeGuard`) ; la constitution, elle, dit qui elle est.
 */
export const COLLECTION_AUTOPILOT_ACTOR: Actor = { type: "system", id: "collection-autopilot" };

/**
 * La VRAIE constitution, par le bus, auteur `system`, dans un contexte de
 * requête dont l'acteur est {@link COLLECTION_AUTOPILOT_ACTOR} : les faits du
 * lot, de ses arrêtés et de ses avis l'écrivent. Même instant et même trace
 * que le passage qui l'appelle — comme l'arrêt automatique du plan
 * (`BusAutomaticDayCloser`).
 */
@Injectable()
export class BusAutomaticCollectionConstituter extends AutomaticCollectionConstituter {
  constructor(
    private readonly commands: CommandBus,
    private readonly clock: Clock,
  ) {
    super();
  }

  async constitute(legalEntityId: string): Promise<readonly string[]> {
    const seed = {
      now: this.clock.now(),
      traceId: currentRequestContext()?.traceId ?? newTraceId(),
      actor: COLLECTION_AUTOPILOT_ACTOR,
    };
    return runWithRequestContext(seed, () =>
      this.commands.execute<ConstituteCollectionBatchesCommand, readonly string[]>(
        new ConstituteCollectionBatchesCommand(legalEntityId, { kind: "system" }),
      ),
    );
  }
}
