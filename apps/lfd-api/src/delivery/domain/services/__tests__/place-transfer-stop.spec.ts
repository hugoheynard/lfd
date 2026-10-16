import { cheapestTransferInsertion } from "../place-transfer-stop.js";
import type { RouteClock } from "../route-timing.js";
import { lineCost } from "./line-cost.js";

const MINUTE = 60;
const SIX = 6 * 3600;
const clock: RouteClock = { earliestDeparture: SIX, stopSeconds: 5 * MINUTE };
// Sur une ligne : le site du village est entre « a » et « b ».
const cost = lineCost({ depot: 0, a: 10, b: 20, site: 15 });

/** Le premier passage d'un véhicule à lui : la tournée seule sur sa camionnette. */
function firstPassage(roundId: string) {
  return { roundId, vehicleId: `v_${roundId}`, passage: 1, open: true, planned: null } as const;
}

describe("où insérer l'arrêt d'un transfert (mode intégré, lot T1)", () => {
  it("prend la place qui ajoute le moins de route, sous la fenêtre « arrivé avant »", () => {
    const place = cheapestTransferInsertion({
      depotId: "depot",
      cost,
      clock,
      transfer: { id: "site", window: { start: null, end: SIX + 3 * 3600 } },
      rounds: [
        {
          ...firstPassage("r_1"),
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
          ...firstPassage("r_1"),
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
        rounds: [{ ...firstPassage("r_1"), stops: [{ id: "a", window: null }] }],
      }),
    ).toBeNull();
  });

  it("départage à temps égal par l'identifiant de tournée — déterministe", () => {
    const rounds = [
      { ...firstPassage("r_2"), stops: [{ id: "b", window: null }] },
      { ...firstPassage("r_1"), stops: [{ id: "b", window: null }] },
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

  /**
   * Régression (2026-10-14, la démo) : chaque tournée était chronométrée
   * SEULE, comme si elle partait à l'heure réglée. Le second passage de
   * Camionnette 1, qui ne part qu'au retour du premier, recevait le transfert
   * du Village dû avant l'ouverture du comptoir — des heures trop tard.
   */
  it("juge un second passage à son vrai départ, au retour du premier", () => {
    const tight = { start: null, end: SIX + 20 * MINUTE };
    const place = cheapestTransferInsertion({
      depotId: "depot",
      cost,
      clock,
      transfer: { id: "site", window: { start: null, end: SIX + 25 * MINUTE } },
      rounds: [
        // Le premier passage tient son client de 6 h 20 au plus juste : aucune place pour le village.
        { ...firstPassage("r_1"), stops: [{ id: "b", window: tight }] },
        // Le second, qui passerait juste à côté du site, ne part qu'au retour du premier.
        {
          roundId: "r_2",
          vehicleId: "v_r_1",
          passage: 2,
          open: true,
          planned: null,
          stops: [{ id: "a", window: null }],
        },
      ],
    });

    expect(place).toBeNull();
  });

  it("le même second passage, seul sur sa camionnette, arriverait à temps", () => {
    const place = cheapestTransferInsertion({
      depotId: "depot",
      cost,
      clock,
      transfer: { id: "site", window: { start: null, end: SIX + 25 * MINUTE } },
      rounds: [{ ...firstPassage("r_2"), stops: [{ id: "a", window: null }] }],
    });

    expect(place?.roundId).toBe("r_2");
  });

  it("ne retarde pas le passage suivant du même véhicule", () => {
    const place = cheapestTransferInsertion({
      depotId: "depot",
      cost,
      clock,
      transfer: { id: "site", window: null },
      rounds: [
        { ...firstPassage("r_1"), stops: [{ id: "a", window: null }] },
        {
          roundId: "r_2",
          vehicleId: "v_r_1",
          passage: 2,
          // Une tournée qui ne reçoit rien (partie, ou déjà porteuse d'un transfert).
          open: false,
          planned: null,
          stops: [{ id: "b", window: { start: null, end: SIX + 50 * MINUTE } }],
        },
      ],
    });

    expect(place).toBeNull();
  });

  it("fait partir un second passage au retour PRÉVU du premier, sans le déplacer", () => {
    const place = cheapestTransferInsertion({
      depotId: "depot",
      cost,
      clock,
      transfer: { id: "site", window: { start: null, end: 8 * 3600 } },
      rounds: [
        // Le premier passage est déjà chronométré : retour prévu à 9 h.
        {
          ...firstPassage("r_1"),
          open: false,
          planned: { departure: 8 * 3600, return: 9 * 3600 },
          stops: [{ id: "b", window: null }],
        },
        {
          roundId: "r_2",
          vehicleId: "v_r_1",
          passage: 2,
          open: true,
          planned: null,
          stops: [{ id: "a", window: null }],
        },
      ],
    });

    expect(place).toBeNull();
  });

  it("ne repousse pas le passage suivant au-delà de son départ prévu", () => {
    const place = cheapestTransferInsertion({
      depotId: "depot",
      cost,
      clock,
      transfer: { id: "site", window: null },
      rounds: [
        // Retour à 6 h 45 sans transfert, déjà après le départ prévu du suivant ; 6 h 50 avec.
        { ...firstPassage("r_1"), stops: [{ id: "b", window: null }] },
        {
          roundId: "r_2",
          vehicleId: "v_r_1",
          passage: 2,
          open: false,
          planned: { departure: SIX + 35 * MINUTE, return: SIX + 3600 },
          stops: [{ id: "a", window: null }],
        },
      ],
    });

    expect(place).toBeNull();
  });
});
