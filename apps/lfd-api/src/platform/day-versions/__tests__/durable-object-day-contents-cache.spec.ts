import { ConsoleLogger, Logger, type LoggerService } from "@nestjs/common";

import { DurableObjectDayContentsCache } from "../durable-object-day-contents-cache.js";
import { UnreadableDayVersionsReplyError } from "../unreadable-day-versions-reply.error.js";

/** Les avertissements journalisés, retenus tels quels pour lire leur `metric`. */
class CapturedWarnings implements LoggerService {
  readonly metrics: string[] = [];
  log(): void {}
  error(): void {}
  warn(message: unknown): void {
    const metric: unknown =
      typeof message === "object" && message !== null ? Reflect.get(message, "metric") : null;
    this.metrics.push(typeof metric === "string" ? metric : String(message));
  }
}

const ADDRESS = { screen: "worksheet", day: "2030-03-12", tag: "orders:1.production:2" };

function answering(response: () => Response): DurableObjectDayContentsCache {
  return new DurableObjectDayContentsCache("http://objets.interne/journees", "rev-1", () =>
    Promise.resolve(response()),
  );
}

describe("DurableObjectDayContentsCache — les contenus de journée vus de l'API", () => {
  let captured: CapturedWarnings;

  beforeEach(() => {
    captured = new CapturedWarnings();
    Logger.overrideLogger(captured);
  });

  afterEach(() => {
    Logger.overrideLogger(new ConsoleLogger());
  });

  it("rend les octets gardés sur un 200", async () => {
    const cache = answering(() => new Response(new Uint8Array([1, 2, 3])));

    await expect(cache.read(ADDRESS)).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("lit un 404 de l'objet comme un raté ordinaire, sans rien journaliser", async () => {
    const cache = answering(
      () => new Response(null, { status: 404, headers: { "x-day-content": "absent" } }),
    );

    await expect(cache.read(ADDRESS)).resolves.toBeNull();
    expect(captured.metrics).toEqual([]);
  });

  /**
   * Régression : un 404 du Worker (appel non aiguillé vers l'objet) devenait
   * un `null` muet — l'écran relisait la base sans qu'aucune trace le dise.
   */
  it("journalise un 404 qui ne vient pas de l'objet, et laisse la base servir", async () => {
    const cache = answering(() => new Response(null, { status: 404 }));

    await expect(cache.read(ADDRESS)).resolves.toBeNull();
    expect(captured.metrics).toEqual(["day_contents.unrouted"]);
  });

  it("refuse toute autre réponse comme illisible", async () => {
    const cache = answering(() => new Response(null, { status: 400 }));

    await expect(cache.read(ADDRESS)).rejects.toBeInstanceOf(UnreadableDayVersionsReplyError);
  });
});
