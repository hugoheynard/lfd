import { AssignDeliveryDriverCommand } from "../../../delivery/application/commands/assign-delivery-driver.command.js";
import {
  DriverRoundNotFoundError,
  DriverWithoutAccessError,
} from "../../../delivery/domain/errors/delivery-driver-errors.js";
import { assignSeedDriver, type DriverSeedReader } from "../delivery-driver.seed.js";

/**
 * Le livreur de la tournée semée : le requérant, par la vraie commande — et un
 * refus du droit de conduire ne fait pas échouer le rechargement.
 */

const AT = new Date(0);
const ROUND = { roundId: "round-1", at: AT };

const reader: DriverSeedReader = {
  roundVersion: () => Promise.resolve(7),
  staffName: (id) => Promise.resolve(`Nom de ${id}`),
};

/** Un bus qui retient ce qu'on lui envoie, et répond `outcome`. */
function busAnswering(outcome: () => Promise<unknown>) {
  const sent: AssignDeliveryDriverCommand[] = [];
  return {
    sent,
    commands: {
      execute: (command: AssignDeliveryDriverCommand): Promise<unknown> => {
        sent.push(command);
        return outcome();
      },
    },
  };
}

describe("assignSeedDriver", () => {
  it("affecte la tournée au requérant, à la version relue, et le nomme", async () => {
    const bus = busAnswering(() => Promise.resolve(undefined));

    const result = await assignSeedDriver(
      { commands: bus.commands, reader, requester: "staff-1" },
      ROUND,
    );

    expect(bus.sent).toEqual([
      new AssignDeliveryDriverCommand("round-1", { version: 7, staffUserId: "staff-1" }),
    ]);
    expect(result).toEqual({ status: "assigned", staffUserId: "staff-1", name: "Nom de staff-1" });
  });

  it("n'affecte personne sans requérant — la ligne de commande", async () => {
    const bus = busAnswering(() => Promise.resolve(undefined));

    const result = await assignSeedDriver(
      { commands: bus.commands, reader, requester: undefined },
      ROUND,
    );

    expect(bus.sent).toEqual([]);
    expect(result).toEqual({ status: "no_requester" });
  });

  it("rend le refus de l'agrégat quand le requérant n'a pas le droit de conduire", async () => {
    const refusal = new DriverWithoutAccessError("Camionnette 1");
    const bus = busAnswering(() => Promise.reject(refusal));

    const result = await assignSeedDriver(
      { commands: bus.commands, reader, requester: "staff-1" },
      ROUND,
    );

    expect(result).toEqual({ status: "refused", reason: refusal.message });
  });

  it("laisse remonter toute autre erreur — seul le droit manquant est toléré", async () => {
    // Une tournée disparue entre la composition et l'affectation : un vrai défaut du semis.
    const failure = new DriverRoundNotFoundError();
    const bus = busAnswering(() => Promise.reject(failure));

    await expect(
      assignSeedDriver({ commands: bus.commands, reader, requester: "staff-1" }, ROUND),
    ).rejects.toBe(failure);
  });
});
