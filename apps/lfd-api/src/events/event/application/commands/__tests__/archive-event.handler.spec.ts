import { EventNotFoundError } from "../../../domain/errors/event-errors.js";
import { declaredEvent } from "../../../domain/entities/__tests__/event-fixtures.js";
import { ArchiveEventCommand } from "../archive-event.command.js";
import { ArchiveEventHandler } from "../archive-event.handler.js";
import { ambient, InMemoryEventRepository } from "./event-doubles.js";

function setup() {
  const events = new InMemoryEventRepository();
  const event = declaredEvent();
  events.saved.set(event.id, event);
  const { clock, uow } = ambient();
  return { events, event, handler: new ArchiveEventHandler(events, clock, uow) };
}

describe("ArchiveEventHandler", () => {
  it("archive l'événement sans l'effacer", async () => {
    const { events, event, handler } = setup();
    await handler.execute(new ArchiveEventCommand(event.id));
    expect(events.saved.get(event.id)?.archivedAt).not.toBeNull();
  });

  it("rejoué, garde le premier instant d'archivage", async () => {
    const { events, event, handler } = setup();
    event.archive(event.createdAt);
    await handler.execute(new ArchiveEventCommand(event.id));
    expect(events.saved.get(event.id)?.archivedAt).toEqual(event.createdAt);
  });

  it("404 sur un événement inconnu", async () => {
    const { handler } = setup();
    await expect(handler.execute(new ArchiveEventCommand("absent"))).rejects.toThrow(
      EventNotFoundError,
    );
  });
});
