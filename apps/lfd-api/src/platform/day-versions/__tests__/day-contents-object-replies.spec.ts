import { ScriptedCallDeadline } from "../../cache-calls/__tests__/cache-call-doubles.js";
import {
  FixedStopwatch,
  RecordingCacheOutcomes,
  RecordingTimings,
} from "../../metrics/__tests__/metrics-doubles.js";
import { FixedWallClock } from "../../time/fixed-wall-clock.js";
import { type DayContentRequest, DayContents } from "../day-contents.js";
import { DurableObjectDayContentsCache } from "../durable-object-day-contents-cache.js";
import { MemoryDayContents } from "./day-contents-doubles.js";

/**
 * Les contenus de journée devant un objet qui répond comme celui de
 * production (`container/day-contents.ts`) : 404 signé `x-day-content:
 * absent` tant que rien n'est rangé, 201 au rangement, 200 et la charge à
 * étiquette égale. Et l'issue de chaque lecture, comptée par instance.
 */

interface Sheet {
  readonly label: string;
}

const isSheet = (raw: unknown): raw is Sheet =>
  typeof raw === "object" && raw !== null && typeof Reflect.get(raw, "label") === "string";

const RULES = { accepts: isSheet, storable: () => true };

const REQUEST: DayContentRequest = {
  screen: "worksheet",
  day: "2030-03-12",
  versions: [{ subject: "production", version: 5 }],
};

/** L'objet des journées, au fil HTTP : une charge par adresse, rangée telle quelle. */
class ObjectOverHttp {
  readonly calls: string[] = [];
  private kept: Uint8Array | null = null;

  readonly fetch = (_url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? "GET";
    this.calls.push(method);
    if (method === "PUT") {
      const body = init.body;
      this.kept = body instanceof Uint8Array ? new Uint8Array(body) : null;
      return Promise.resolve(new Response(null, { status: 201 }));
    }
    return Promise.resolve(
      this.kept === null
        ? new Response(null, { status: 404, headers: { "x-day-content": "absent" } })
        : new Response(new Uint8Array(this.kept)),
    );
  };
}

function around(cache: DurableObjectDayContentsCache | MemoryDayContents) {
  const deadline = new ScriptedCallDeadline();
  const outcomes = new RecordingCacheOutcomes();
  const contents = new DayContents(
    cache,
    deadline,
    new FixedWallClock(new Date(Date.UTC(2030, 0, 1))),
    new FixedStopwatch(3),
    new RecordingTimings(),
    outcomes,
  );
  let loads = 0;
  const load = (): Promise<Sheet> => {
    loads += 1;
    return Promise.resolve({ label: `lecture ${loads}` });
  };
  return { contents, deadline, outcomes, load, loads: () => loads };
}

/** Le rangement part après la réponse : laisser passer ses micro-tâches. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("DayContents devant l'objet de production", () => {
  /**
   * Régression : en production, la Supervision rouverte rangeait de nouveau
   * ses contenus (PUT 201, même étiquette) sans qu'aucune relecture ne soit vue.
   */
  it("relit l'objet à chaque ouverture et sert la charge rangée, sans recharger ni ranger", async () => {
    const object = new ObjectOverHttp();
    const { contents, load, loads } = around(
      new DurableObjectDayContentsCache("http://objets.interne/journees", "r1", object.fetch),
    );

    for (let opening = 0; opening < 3; opening += 1) {
      await expect(contents.contentOf(REQUEST, load, RULES)).resolves.toEqual({
        label: "lecture 1",
      });
      await settle();
    }

    expect(object.calls).toEqual(["GET", "PUT", "GET", "GET"]);
    expect(loads()).toBe(1);
  });

  it("compte par instance l'issue de chaque lecture : absent, servi, repli", async () => {
    const cache = new MemoryDayContents();
    const { contents, deadline, outcomes, load } = around(cache);

    await contents.contentOf(REQUEST, load, RULES);
    await settle();
    await contents.contentOf(REQUEST, load, RULES);
    deadline.late = true;
    await contents.contentOf(REQUEST, load, RULES);

    expect(outcomes.recorded).toEqual([
      "day_contents:miss",
      "day_contents:hit",
      "day_contents:fallback",
    ]);
  });

  it("compte « illisible » une charge que l'écran ne reconnaît pas", async () => {
    const cache = new MemoryDayContents();
    const { contents, outcomes } = around(cache);
    await contents.contentOf(REQUEST, () => Promise.resolve({ label: "a" }), RULES);
    await settle();

    await contents.contentOf(REQUEST, () => Promise.resolve({ label: "b" }), {
      accepts: (raw: unknown): raw is Sheet => isSheet(raw) && raw.label === "jamais rangé",
      storable: () => false,
    });

    expect(outcomes.recorded).toEqual(["day_contents:miss", "day_contents:unreadable"]);
  });
});
