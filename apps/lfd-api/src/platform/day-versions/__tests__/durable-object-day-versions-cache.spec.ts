import { DurableObjectDayVersionsCache } from "../durable-object-day-versions-cache.js";
import { UnreadableDayVersionsReplyError } from "../unreadable-day-versions-reply.error.js";

interface Sent {
  readonly url: string;
  readonly method: string;
  readonly body: string | null;
}

/** Un `fetch` qui rend une réponse fabriquée et retient ce qui est parti. */
function answering(response: () => Response) {
  const sent: Sent[] = [];
  const fetchFn = (url: string, init: RequestInit): Promise<Response> => {
    sent.push({
      url,
      method: init.method ?? "GET",
      body: typeof init.body === "string" ? init.body : null,
    });
    return Promise.resolve(response());
  };
  return { sent, fetchFn };
}

const DAY = "2030-03-12";
// Instant comparé à rien : il ne fait que voyager.
const READ_AT = Date.UTC(2030, 2, 12, 9);

describe("DurableObjectDayVersionsCache — l'objet des journées vu de l'API", () => {
  it("lit la carte d'une journée sous la révision du code", async () => {
    const { sent, fetchFn } = answering(() =>
      Response.json({ subjects: { orders: { version: 3, readAtMs: READ_AT } } }),
    );
    const cache = new DurableObjectDayVersionsCache("http://journees.interne/", "rev-1", fetchFn);

    await expect(cache.read(DAY)).resolves.toEqual({
      subjects: { orders: { version: 3, readAtMs: READ_AT } },
    });
    expect(sent).toEqual([
      {
        url: "http://journees.interne/scopes/2030-03-12?revision=rev-1",
        method: "GET",
        body: null,
      },
    ]);
  });

  it("rend null sur un raté (404)", async () => {
    const { fetchFn } = answering(() => new Response(null, { status: 404 }));

    await expect(
      new DurableObjectDayVersionsCache("http://j", "r", fetchFn).read(DAY),
    ).resolves.toBeNull();
  });

  it("refuse une réponse illisible, plutôt que de servir un numéro inventé", async () => {
    const malformed = answering(() =>
      Response.json({ subjects: { orders: { version: "3", readAtMs: 1 } } }),
    );
    const failing = answering(() => new Response(null, { status: 500 }));

    await expect(
      new DurableObjectDayVersionsCache("http://j", "r", malformed.fetchFn).read(DAY),
    ).rejects.toBeInstanceOf(UnreadableDayVersionsReplyError);
    await expect(
      new DurableObjectDayVersionsCache("http://j", "r", failing.fetchFn).read(DAY),
    ).rejects.toBeInstanceOf(UnreadableDayVersionsReplyError);
  });

  it("range une carte ; un refus d'une carte plus ancienne (409) n'est pas une faute", async () => {
    const stored = answering(() => new Response(null, { status: 201 }));
    const older = answering(() => new Response(null, { status: 409 }));
    const card = { subjects: { orders: { version: 3, readAtMs: READ_AT } } };

    await new DurableObjectDayVersionsCache("http://j", "r", stored.fetchFn).store(DAY, card);
    await expect(
      new DurableObjectDayVersionsCache("http://j", "r", older.fetchFn).store(DAY, card),
    ).resolves.toBeUndefined();
    expect(stored.sent).toEqual([
      { url: "http://j/scopes/2030-03-12?revision=r", method: "PUT", body: JSON.stringify(card) },
    ]);
  });

  it("refuse un statut de rangement inattendu", async () => {
    const { fetchFn } = answering(() => new Response(null, { status: 400 }));

    await expect(
      new DurableObjectDayVersionsCache("http://j", "r", fetchFn).store(DAY, { subjects: {} }),
    ).rejects.toBeInstanceOf(UnreadableDayVersionsReplyError);
  });

  it("lit et range la carte des sujets globaux sous `/scopes/global`", async () => {
    const { sent, fetchFn } = answering(() =>
      Response.json({ subjects: { companies: { version: 9, readAtMs: READ_AT } } }),
    );
    const cache = new DurableObjectDayVersionsCache("http://j", "r", fetchFn);

    await expect(cache.read("global")).resolves.toEqual({
      subjects: { companies: { version: 9, readAtMs: READ_AT } },
    });
    expect(sent[0]?.url).toBe("http://j/scopes/global?revision=r");
  });
});
