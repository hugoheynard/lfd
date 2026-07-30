import type { ActivationSupportPayload } from "@lfd/contracts";

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
  } satisfies SupportRequestRepository;
}

describe("RequestActivationSupportHandler", () => {
  it("enregistre la demande d'un membre sans demande ouverte", async () => {
    const recorder = { recorded: 0 };
    const handler = new RequestActivationSupportHandler(
      memberships("member"),
      supportRepo(false, recorder),
    );

    const id = await handler.execute(
      new RequestActivationSupportCommand("user_1", "company_1", PAYLOAD),
    );

    expect(id).toBe("support_1");
    expect(recorder.recorded).toBe(1);
  });

  it("refuse (409) si une demande est déjà ouverte", async () => {
    const recorder = { recorded: 0 };
    const handler = new RequestActivationSupportHandler(
      memberships("member"),
      supportRepo(true, recorder),
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
