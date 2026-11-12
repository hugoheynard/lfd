import type { ActivationSupportPayload, SupportRequestView } from "@lfd/contracts";

import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { SupportRequestNotFoundError } from "../../../domain/errors/support-errors.js";
import { SupportHandledEvent } from "../../../domain/events/support-handled.event.js";
import {
  SupportRequestRepository,
  type HandledSupportRequest,
} from "../../../domain/ports/support-request.repository.js";
import { HandleSupportRequestCommand } from "../handle-support-request.command.js";
import { HandleSupportRequestHandler } from "../handle-support-request.handler.js";
import { journalNames } from "./member-acts-doubles.js";

// Comparée à aucune horloge : l'instant que le handler fige.
const NOW = new Date("2026-06-01T08:00:00.000Z");

/** Une demande ouverte `sr_1`, qui se clôt une fois — comme l'`UPDATE … WHERE handled_at IS NULL`. */
class OneOpenRequest extends SupportRequestRepository {
  private handled = false;

  hasOpenRequest(): Promise<boolean> {
    return Promise.resolve(!this.handled);
  }
  record(_userId: string, _request: ActivationSupportPayload): Promise<string> {
    return Promise.resolve("sr_1");
  }
  list(): Promise<readonly SupportRequestView[]> {
    return Promise.resolve([]);
  }
  markHandled(id: string): Promise<HandledSupportRequest | null> {
    if (id !== "sr_1") {
      return Promise.resolve(null);
    }
    const newlyHandled = !this.handled;
    this.handled = true;
    return Promise.resolve({ companyId: "c1", requestedByUserId: "u1", newlyHandled });
  }
}

function build() {
  const events = new RecordingPublisher();
  const handler = new HandleSupportRequestHandler(
    new OneOpenRequest(),
    events,
    new FixedClock(NOW),
    journalNames(),
  );
  return { events, handler };
}

describe("HandleSupportRequestHandler", () => {
  it("clôt la demande et publie le traitement", async () => {
    const { events, handler } = build();

    await handler.execute(new HandleSupportRequestCommand("sr_1"));

    expect(events.published).toHaveLength(1);
    expect(events.published[0]).toBeInstanceOf(SupportHandledEvent);
  });

  // Régression : re-traiter une demande close republiait `support.handled` à chaque appel.
  it("rejouée sur une demande déjà traitée, ne republie rien", async () => {
    const { events, handler } = build();
    await handler.execute(new HandleSupportRequestCommand("sr_1"));

    await handler.execute(new HandleSupportRequestCommand("sr_1"));

    expect(events.published).toHaveLength(1);
  });

  it("refuse une demande inconnue (404)", async () => {
    const { handler } = build();

    await expect(handler.execute(new HandleSupportRequestCommand("inconnue"))).rejects.toThrow(
      SupportRequestNotFoundError,
    );
  });
});
