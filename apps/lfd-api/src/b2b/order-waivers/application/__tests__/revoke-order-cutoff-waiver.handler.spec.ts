import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { OrderCutoffWaiverNotFoundError } from "../../domain/order-cutoff-waiver-errors.js";
import { GrantOrderCutoffWaiverCommand } from "../grant-order-cutoff-waiver.command.js";
import { GrantOrderCutoffWaiverHandler } from "../grant-order-cutoff-waiver.handler.js";
import { RevokeOrderCutoffWaiverCommand } from "../revoke-order-cutoff-waiver.command.js";
import { RevokeOrderCutoffWaiverHandler } from "../revoke-order-cutoff-waiver.handler.js";
import { COMPANY_NAME, InMemoryWaivers, PAYLOAD } from "./order-cutoff-waiver-doubles.js";

/** L'accord passe par son vrai handler : le retrait doit relire ce qu'il a ouvert. */
function build() {
  const waivers = new InMemoryWaivers();
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  return {
    waivers,
    events,
    grant: new GrantOrderCutoffWaiverHandler(waivers, events, uow),
    revoke: new RevokeOrderCutoffWaiverHandler(waivers, events, uow),
  };
}

describe("RevokeOrderCutoffWaiverHandler", () => {
  it("journalise le retrait avec ce que la dérogation décidait", async () => {
    const { grant, revoke, events } = build();
    const id = await grant.execute(new GrantOrderCutoffWaiverCommand(PAYLOAD, "fiche-1"));

    await revoke.execute(new RevokeOrderCutoffWaiverCommand(id));

    expect(events.factTypes()).toEqual([
      "order_cutoff_waiver.granted",
      "order_cutoff_waiver.revoked",
    ]);
    expect(events.traced[1]?.journalFact()).toMatchObject({
      subjectId: id,
      payload: { company: { id: "cmp_1", name: COMPANY_NAME }, fulfillmentDate: "2026-09-21" },
    });
  });

  it("n'écrit aucun fait quand la dérogation est introuvable — ou a déjà servi", async () => {
    const { revoke, events } = build();

    await expect(
      revoke.execute(new RevokeOrderCutoffWaiverCommand("wvr_absente")),
    ).rejects.toBeInstanceOf(OrderCutoffWaiverNotFoundError);
    expect(events.traced).toHaveLength(0);
  });
});
