import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { DeliveryBinOffice } from "../../delivery-bin-office.js";
import {
  binOf,
  binTypeOf,
  FixedBinTypeLookup,
  InMemoryBins,
  InMemoryStopLoadings,
  ScriptedDrawer,
  stopOf,
} from "./loading-doubles.js";
import { FixedDeliveryOrders } from "./round-doubles.js";
import {
  FixedTransferredOrders,
  InMemoryInternalTransfers,
  InternalTransfersReaderOver,
} from "../../__tests__/transfer-doubles.js";

const VOIDED_AT = new Date(0);

function officeOver(bins: InMemoryBins): DeliveryBinOffice {
  return new DeliveryBinOffice(
    bins,
    new FixedBinTypeLookup(binTypeOf("t_m")),
    new InMemoryStopLoadings(stopOf("o_1", { roundOrderIds: ["o_1"], bins: [] })),
    new FixedDeliveryOrders([]),
    new ScriptedDrawer(["JJJJJJ"]),
    new FixedIdGenerator("bin"),
    new FixedClock(VOIDED_AT),
    new RecordingPublisher(),
    new DirectUnitOfWork(),
    new FixedTransferredOrders(),
    new InternalTransfersReaderOver(new InMemoryInternalTransfers()),
  );
}

function binsOfADay(): InMemoryBins {
  return new InMemoryBins(
    binOf("b_1", "o_1", "AAAAAA"),
    binOf("b_2", "o_1", "BBBBBB", { voidedAt: VOIDED_AT }),
    binOf("b_3", "o_1", "CCCCCC"),
  );
}

describe("DeliveryBinOffice — les bacs vivants se lisent en lot", () => {
  it("rend ceux qui existent et ne sont pas annulés", async () => {
    const live = await officeOver(binsOfADay()).liveAmong(["b_1", "b_2", "b_3", "b_absent", "b_1"]);

    expect([...live].sort()).toEqual(["b_1", "b_3"]);
  });

  /**
   * Régression : `liveAmong` lisait un bac par bac — 51 `DeliveryBin.findUnique`
   * sur la fiche du fournil et sur le colisage d'une journée colisée.
   */
  it("lit tous les bacs en UNE lecture, jamais un par bac", async () => {
    const bins = binsOfADay();

    await officeOver(bins).liveAmong(["b_1", "b_2", "b_3"]);

    expect({ one: bins.loadCalls, many: bins.loadManyCalls }).toEqual({ one: 0, many: 1 });
  });

  it("vérifie les bacs à portée de main en UNE lecture aussi", async () => {
    const bins = binsOfADay();

    await officeOver(bins).assertAtHand("o_1", ["b_1", "b_2", "b_3"]);

    expect({ one: bins.loadCalls, many: bins.loadManyCalls }).toEqual({ one: 0, many: 1 });
  });
});
