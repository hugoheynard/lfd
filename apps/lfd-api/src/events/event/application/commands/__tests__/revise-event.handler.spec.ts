import {
  EventArchivedError,
  EventNotFoundError,
  InvalidEventNameError,
} from "../../../domain/errors/event-errors.js";
import { declaredEvent } from "../../../domain/entities/__tests__/event-fixtures.js";
import { ReviseEventCommand } from "../revise-event.command.js";
import { ReviseEventHandler } from "../revise-event.handler.js";
import { ambient, InMemoryEventRepository } from "./event-doubles.js";

function setup() {
  const events = new InMemoryEventRepository();
  const event = declaredEvent();
  events.saved.set(event.id, event);
  const { clock, uow } = ambient();
  return { events, event, handler: new ReviseEventHandler(events, clock, uow) };
}

describe("ReviseEventHandler", () => {
  it("renomme seulement quand la date n'est pas donnée", async () => {
    const { events, event, handler } = setup();
    await handler.execute(new ReviseEventCommand(event.id, "Mariage", null));
    expect(events.saved.get(event.id)?.name.value).toBe("Mariage");
    expect(events.saved.get(event.id)?.date.value).toBe("2026-12-05");
  });

  it("déplace seulement quand le nom n'est pas donné", async () => {
    const { events, event, handler } = setup();
    await handler.execute(new ReviseEventCommand(event.id, null, "2026-12-06"));
    expect(events.saved.get(event.id)?.date.value).toBe("2026-12-06");
    expect(events.saved.get(event.id)?.name.value).toBe("Salon du chocolat");
  });

  it("un nom refusé ne laisse pas passer la date", async () => {
    const { events, event, handler } = setup();
    await expect(
      handler.execute(new ReviseEventCommand(event.id, " ", "2026-12-06")),
    ).rejects.toThrow(InvalidEventNameError);
    expect(events.saves).toBe(0);
  });

  it("404 sur un événement inconnu", async () => {
    const { handler } = setup();
    await expect(handler.execute(new ReviseEventCommand("absent", "X", null))).rejects.toThrow(
      EventNotFoundError,
    );
  });

  it("409 sur un événement archivé", async () => {
    const { event, handler } = setup();
    event.archive(event.createdAt);
    await expect(handler.execute(new ReviseEventCommand(event.id, "X", null))).rejects.toThrow(
      EventArchivedError,
    );
  });
});
