import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { OpenWaiverAlreadyExistsError } from "../../domain/order-cutoff-waiver-errors.js";
import { GrantOrderCutoffWaiverCommand } from "../grant-order-cutoff-waiver.command.js";
import { GrantOrderCutoffWaiverHandler } from "../grant-order-cutoff-waiver.handler.js";
import { COMPANY_NAME, InMemoryWaivers, PAYLOAD } from "./order-cutoff-waiver-doubles.js";

function build() {
  const waivers = new InMemoryWaivers();
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  return { waivers, events, grant: new GrantOrderCutoffWaiverHandler(waivers, events, uow) };
}

describe("GrantOrderCutoffWaiverHandler", () => {
  it("journalise la dérogation accordée : pour qui, quel jour, pourquoi", async () => {
    const { grant, events } = build();

    const id = await grant.execute(new GrantOrderCutoffWaiverCommand(PAYLOAD, "fiche-1"));

    expect(id).toBe("wvr_1");
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "order_cutoff_waiver.granted",
        subjectType: "order_cutoff_waiver",
        subjectId: "wvr_1",
        payload: {
          // Le client sous son nom DU MOMENT (D5) : une enseigne change, la
          // dérogation d'hier doit garder le nom d'hier.
          company: { id: "cmp_1", name: COMPANY_NAME },
          fulfillmentDate: "2026-09-21",
          reason: "Client bloqué en tournée",
        },
      },
    ]);
  });

  it("n'écrit aucun fait quand une dérogation est déjà ouverte", async () => {
    const { grant, events } = build();
    await grant.execute(new GrantOrderCutoffWaiverCommand(PAYLOAD, "fiche-1"));

    await expect(
      grant.execute(new GrantOrderCutoffWaiverCommand(PAYLOAD, "fiche-2")),
    ).rejects.toBeInstanceOf(OpenWaiverAlreadyExistsError);
    expect(events.factTypes()).toEqual(["order_cutoff_waiver.granted"]);
  });
});
