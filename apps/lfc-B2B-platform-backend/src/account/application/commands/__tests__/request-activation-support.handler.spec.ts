import type { EventBus } from "@nestjs/cqrs";
import type { ActivationSupportPayload } from "@lfd/contracts";

import { FixedClock } from "../../../../infra/time/fixed-clock.js";
import { SupportRequestedEvent } from "../../../domain/events/support-requested.event.js";

import {
  CompanyNotFoundError,
  OpenSupportRequestExistsError,
} from "../../../domain/errors/account-errors.js";
import { MembershipReader } from "../../../domain/ports/membership.reader.js";
import { SupportRequestRepository } from "../../../domain/ports/support-request.repository.js";
import type { CompanyRole } from "../../../domain/value-objects/company-role.js";
import { RequestActivationSupportCommand } from "../request-activation-support.command.js";
import { RequestActivationSupportHandler } from "../request-activation-support.handler.js";

const PAYLOAD: ActivationSupportPayload = {
  channel: "email",
  phoneNumber: "",
  asap: true,
  scheduledDate: null,
  slot: null,
  message: "",
};

function memberships(role: CompanyRole | null): MembershipReader {
  return { roleOf: () => Promise.resolve(role) } satisfies MembershipReader;
}

function supportRepo(hasOpen: boolean, recorder?: { recorded: number }): SupportRequestRepository {
  return {
    hasOpenRequest: () => Promise.resolve(hasOpen),
    record: () => {
      if (recorder !== undefined) {
        recorder.recorded += 1;
      }
      return Promise.resolve("support_1");
    },
    list: () => Promise.resolve([]),
    markHandled: () => Promise.resolve("company_1"),
  } satisfies SupportRequestRepository;
}

/** Bus doublé : on capture ce qui est publié, sans monter CQRS. */
function eventBus(published: unknown[]): EventBus {
  return { publish: (event: unknown) => published.push(event) } as unknown as EventBus;
}

const CLOCK = new FixedClock(new Date("2026-06-01T08:00:00.000Z"));

describe("RequestActivationSupportHandler", () => {
  it("enregistre la demande d'un membre sans demande ouverte", async () => {
    const recorder = { recorded: 0 };
    const published: unknown[] = [];
    const handler = new RequestActivationSupportHandler(
      memberships("member"),
      supportRepo(false, recorder),
      eventBus(published),
      CLOCK,
    );

    const id = await handler.execute(
      new RequestActivationSupportCommand("user_1", "company_1", PAYLOAD),
    );

    expect(id).toBe("support_1");
    expect(recorder.recorded).toBe(1);
    // Le journal capte le dépôt : c'est lui qui, avec la clôture, donnera le
    // délai de traitement de la file.
    expect(published).toEqual([
      new SupportRequestedEvent("support_1", "company_1", "email", CLOCK.now()),
    ]);
  });

  it("refuse (409) si une demande est déjà ouverte", async () => {
    const recorder = { recorded: 0 };
    const handler = new RequestActivationSupportHandler(
      memberships("member"),
      supportRepo(true, recorder),
      eventBus([]),
      CLOCK,
    );

    await expect(
      handler.execute(new RequestActivationSupportCommand("user_1", "company_1", PAYLOAD)),
    ).rejects.toBeInstanceOf(OpenSupportRequestExistsError);
    expect(recorder.recorded).toBe(0);
  });

  it("refuse (404 non-divulguant) un non-membre", async () => {
    const handler = new RequestActivationSupportHandler(memberships(null), supportRepo(false));

    await expect(
      handler.execute(new RequestActivationSupportCommand("user_x", "company_1", PAYLOAD)),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
  });
});
