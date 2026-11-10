import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  RequestReasonKindImmutableError,
  RequestReasonLabelMissingError,
  RequestReasonNotFoundError,
} from "../../../domain/errors/contact-errors.js";
import { AT, CONTACT_SETTINGS, LATER, reason } from "../../../domain/__tests__/request-fixtures.js";
import { ArchiveRequestReasonCommand } from "../archive-request-reason.command.js";
import { ArchiveRequestReasonHandler } from "../archive-request-reason.handler.js";
import { CreateRequestReasonCommand } from "../create-request-reason.command.js";
import { CreateRequestReasonHandler } from "../create-request-reason.handler.js";
import { ReviseRequestReasonCommand } from "../revise-request-reason.command.js";
import { ReviseRequestReasonHandler } from "../revise-request-reason.handler.js";
import { MemoryReasons } from "./contact-doubles.js";

describe("Les motifs — créer, réviser, archiver", () => {
  it("crée un motif dans son onglet et rend son id", async () => {
    const reasons = new MemoryReasons();
    const handler = new CreateRequestReasonHandler(
      reasons,
      new FixedIdGenerator("r"),
      new FixedClock(AT),
    );
    const id = await handler.execute(
      new CreateRequestReasonCommand({ ...CONTACT_SETTINGS, kind: "order_problem" }),
    );
    expect(id).toBe("r_000001");
    expect(reasons.saved[0]?.kind).toBe("order_problem");
  });

  it("refuse un motif sans libellé français : rien enregistré", async () => {
    const reasons = new MemoryReasons();
    const handler = new CreateRequestReasonHandler(
      reasons,
      new FixedIdGenerator("r"),
      new FixedClock(AT),
    );
    await expect(
      handler.execute(
        new CreateRequestReasonCommand({ ...CONTACT_SETTINGS, label: { fr: "", en: "x", it: "" } }),
      ),
    ).rejects.toThrow(RequestReasonLabelMissingError);
    expect(reasons.saved).toHaveLength(0);
  });

  it("révise, mais refuse de changer le formulaire : rien enregistré", async () => {
    const reasons = new MemoryReasons(reason());
    const handler = new ReviseRequestReasonHandler(reasons, new FixedClock(LATER));
    await handler.execute(
      new ReviseRequestReasonCommand("r_pro", { ...CONTACT_SETTINGS, position: 3 }),
    );
    expect(reasons.saved).toHaveLength(1);
    await expect(
      handler.execute(
        new ReviseRequestReasonCommand("r_pro", { ...CONTACT_SETTINGS, kind: "order_problem" }),
      ),
    ).rejects.toThrow(RequestReasonKindImmutableError);
    expect(reasons.saved).toHaveLength(1);
  });

  it("archive ; un motif inconnu est nommé", async () => {
    const reasons = new MemoryReasons(reason());
    const handler = new ArchiveRequestReasonHandler(reasons, new FixedClock(LATER));
    await handler.execute(new ArchiveRequestReasonCommand("r_pro"));
    expect(reasons.saved[0]?.toPersistence().archivedAt).toEqual(LATER);
    await expect(handler.execute(new ArchiveRequestReasonCommand("r404"))).rejects.toThrow(
      RequestReasonNotFoundError,
    );
  });
});
