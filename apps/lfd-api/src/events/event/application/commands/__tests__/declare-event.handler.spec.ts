import {
  InvalidEventDateError,
  InvalidEventNameError,
} from "../../../domain/errors/event-errors.js";
import { AT } from "../../../domain/entities/__tests__/event-fixtures.js";
import { DeclareEventCommand } from "../declare-event.command.js";
import { DeclareEventHandler } from "../declare-event.handler.js";
import { ambient, InMemoryEventRepository } from "./event-doubles.js";

function setup() {
  const events = new InMemoryEventRepository();
  const { clock, ids, uow, intents } = ambient();
  return { events, handler: new DeclareEventHandler(events, ids, clock, uow, intents) };
}

describe("DeclareEventHandler", () => {
  it("déclare l'événement pour lafoliecoffee, avec son auteur, et rend son id", async () => {
    const { events, handler } = setup();
    const id = await handler.execute(
      new DeclareEventCommand(" Salon ", "2026-12-05", "staff_1", "k1"),
    );
    const event = events.saved.get(id);
    expect(event?.name.value).toBe("Salon");
    expect(event?.date.value).toBe("2026-12-05");
    expect(event?.applications.values).toEqual(["lafoliecoffee"]);
    expect(event?.createdBy).toBe("staff_1");
    expect(event?.createdAt).toBe(AT);
  });

  it("rejouée avec la même clé, ne crée qu'un événement et rend le même id", async () => {
    const { events, handler } = setup();
    const command = new DeclareEventCommand("Salon", "2026-12-05", "staff_1", "k1");
    const first = await handler.execute(command);
    const second = await handler.execute(command);
    expect(second).toBe(first);
    expect(events.saves).toBe(1);
  });

  it("refuse un nom vide sans rien écrire", async () => {
    const { events, handler } = setup();
    await expect(
      handler.execute(new DeclareEventCommand("  ", "2026-12-05", "staff_1", "k1")),
    ).rejects.toThrow(InvalidEventNameError);
    expect(events.saves).toBe(0);
  });

  it("refuse une date qui n'existe pas", async () => {
    const { handler } = setup();
    await expect(
      handler.execute(new DeclareEventCommand("Salon", "2026-02-30", "staff_1", "k1")),
    ).rejects.toThrow(InvalidEventDateError);
  });
});
