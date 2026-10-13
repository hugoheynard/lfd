import { cheapestTransferInsertion } from "../place-transfer-stop.js";
import type { RouteClock } from "../route-timing.js";
import { lineCost } from "./line-cost.js";

const MINUTE = 60;
const SIX = 6 * 3600;
const clock: RouteClock = { earliestDeparture: SIX, stopSeconds: 5 * MINUTE };
// Sur une ligne : le site du village est entre « a » et « b ».
const cost = lineCost({ depot: 0, a: 10, b: 20, site: 15 });

describe("où insérer l'arrêt d'un transfert (mode intégré, lot T1)", () => {
  it("prend la place qui ajoute le moins de route, sous la fenêtre « arrivé avant »", () => {
    const place = cheapestTransferInsertion({
      depotId: "depot",
      cost,
      clock,
      transfer: { id: "site", window: { start: null, end: SIX + 3 * 3600 } },
      rounds: [
        {
          roundId: "r_1",
          stops: [
            { id: "a", window: null },
            { id: "b", window: null },
          ],
        },
      ],
    });

    // Entre « a » et « b » : aucune route de plus, seulement 5 minutes sur place.
    expect(place).toEqual({ roundId: "r_1", after: 1, addedSeconds: 5 * MINUTE });
  });

  it("ne retarde jamais un client livré pour servir le village", () => {
    const place = cheapestTransferInsertion({
      depotId: "depot",
      cost,
      clock: { ...clock, earliestDeparture: SIX },
      transfer: { id: "site", window: null },
      rounds: [
        {
          roundId: "r_1",
          // « a » doit être servi au plus tard 6 h 10 : rien ne passe avant lui.
          stops: [{ id: "a", window: { start: null, end: SIX + 10 * MINUTE } }],
        },
      ],
    });

    expect(place?.after).toBe(1);
  });

  it("rend `null` quand aucune tournée n'arrive à temps : repli sur une dédiée (Q-T9)", () => {
    expect(
      cheapestTransferInsertion({
        depotId: "depot",
        cost,
        clock,
        transfer: { id: "site", window: { start: null, end: SIX + 10 * MINUTE } },
        rounds: [{ roundId: "r_1", stops: [{ id: "a", window: null }] }],
      }),
    ).toBeNull();
  });

  it("départage à temps égal par l'identifiant de tournée — déterministe", () => {
    const rounds = [
      { roundId: "r_2", stops: [{ id: "b", window: null }] },
      { roundId: "r_1", stops: [{ id: "b", window: null }] },
    ];

    expect(
      cheapestTransferInsertion({
        depotId: "depot",
        cost,
        clock,
        transfer: { id: "site", window: null },
        rounds,
      })?.roundId,
    ).toBe("r_1");
  });
});
