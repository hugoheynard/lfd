import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { WallClock } from "../../../platform/time/wall-clock.js";
import { Mail } from "../../channels/requests/mail.js";
import {
  DeferredMailCheckFailedError,
  DeferredMailCheckTimeoutError,
} from "../domain/errors/deferred-mail-check.errors.js";
import { MailRequestRepository } from "../domain/ports/mail-request.repository.js";
import { Pause } from "../domain/ports/pause.js";

/**
 * Le délai laissé à l'e-mail différé pour partir : la boîte d'envoi relaie
 * après validation, l'abonné engage, l'envoi part. En marche normale, quelques
 * secondes ; 75 s couvrent un relais lent et restent sous la coupure de 100 s du proxy Cloudflare : au-delà, l'étape recevrait un 524 au lieu de l'erreur nommée (Hugo, 2026-11-07).
 */
export const DEFERRED_CHECK_TIMEOUT_MS = 75_000;

/** L'espacement des relectures de l'état : une lecture par seconde au plus. */
export const DEFERRED_CHECK_POLL_MS = 1_000;

const SECOND_MS = 1_000;

/** Ce qu'on envoie, et à qui. */
export interface DeferredMailCheckDemand {
  readonly revision: string;
  readonly from: string;
  readonly to: string;
  readonly idempotencyKey: string;
}

/**
 * **La moitié différée de la sonde de déploiement** (plan
 * `plan-service-e-mails.md`, § 25, point 1).
 *
 * Presque tous nos e-mails partent par `mail.send` : demande écrite dans la
 * transaction, fait dans la boîte d'envoi, relais, abonné, Resend. L'envoi
 * immédiat de la sonde n'éprouve rien de cette chaîne. Celle-ci demande un
 * `ops.deploy-check` par le geste par défaut, dans sa propre unité de
 * travail, puis relit l'état de la demande jusqu'à « envoyée ».
 *
 * L'attente se mesure au **mur** (`WallClock`) : le `Clock` est gelé à
 * l'ingress pour toute la requête, et une échéance calculée dessus ne
 * passerait jamais.
 */
@Injectable()
export class DeferredMailCheck {
  constructor(
    private readonly mail: Mail,
    private readonly unitOfWork: UnitOfWork,
    private readonly requests: MailRequestRepository,
    private readonly wall: WallClock,
    private readonly pause: Pause,
  ) {}

  /**
   * @throws {DeferredMailCheckFailedError} la demande est passée `failed` ou `refused`.
   * @throws {DeferredMailCheckTimeoutError} elle n'est pas envoyée dans le délai.
   */
  async run(demand: DeferredMailCheckDemand): Promise<void> {
    await this.unitOfWork.run(() =>
      this.mail.send({
        to: demand.to,
        template: "ops.deploy-check",
        data: { revision: demand.revision, fromAddress: demand.from },
        idempotencyKey: demand.idempotencyKey,
      }),
    );
    await this.awaitSent(demand.idempotencyKey);
  }

  private async awaitSent(key: string): Promise<void> {
    const deadline = this.wall.elapsedNow().getTime() + DEFERRED_CHECK_TIMEOUT_MS;
    for (;;) {
      const request = await this.requests.findByIdempotencyKey(key);
      if (request?.status === "sent") {
        return;
      }
      if (request !== null && (request.status === "failed" || request.status === "refused")) {
        throw new DeferredMailCheckFailedError(request.status, request.snapshot().failureReason);
      }
      if (this.wall.elapsedNow().getTime() >= deadline) {
        throw new DeferredMailCheckTimeoutError(
          request?.status ?? "introuvable",
          DEFERRED_CHECK_TIMEOUT_MS / SECOND_MS,
        );
      }
      await this.pause.wait(DEFERRED_CHECK_POLL_MS);
    }
  }
}
