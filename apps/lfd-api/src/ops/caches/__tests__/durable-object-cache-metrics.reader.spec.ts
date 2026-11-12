import { DurableObjectCacheMetricsReader } from "../durable-object-cache-metrics.reader.js";

/**
 * L'adaptateur des compteurs : ces tests échouent si un objet en panne fait
 * tomber la page, ou si un objet non configuré se lit comme un objet muet.
 */
const REPLY = { rows: [], peaks: [{ hourMs: 3_600_000, perSecond: 2 }] };

describe("DurableObjectCacheMetricsReader", () => {
  it("lit chaque objet par sa route interne, depuis l'heure demandée", async () => {
    const asked: string[] = [];
    const reader = new DurableObjectCacheMetricsReader(
      [{ object: "day-versions", origin: "http://journees.interne/" }],
      (url) => {
        asked.push(url);
        return Promise.resolve(Response.json(REPLY));
      },
    );

    const [reading] = await reader.read(7_200_000);

    expect(asked).toEqual(["http://journees.interne/metrics?since=7200000"]);
    expect(reading).toEqual({
      object: "day-versions",
      state: "read",
      hours: [],
      peaks: REPLY.peaks,
    });
  });

  it("dit non configuré sans adresse, injoignable en panne ou sur une réponse illisible", async () => {
    const reader = new DurableObjectCacheMetricsReader(
      [
        { object: "sans-adresse", origin: null },
        { object: "en-panne", origin: "http://panne.interne" },
        { object: "illisible", origin: "http://illisible.interne" },
      ],
      (url) =>
        url.startsWith("http://panne")
          ? Promise.reject(new TypeError("fetch failed"))
          : Promise.resolve(Response.json({ rows: "non" })),
    );

    const readings = await reader.read(0);

    expect(readings.map((one) => [one.object, one.state])).toEqual([
      ["sans-adresse", "not-configured"],
      ["en-panne", "unreachable"],
      ["illisible", "unreachable"],
    ]);
  });
});
