import { AppConfig } from "../../../platform/config/app-config.js";
import { FixedStopwatch } from "../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { PROBE_TIMEOUT_MS } from "../../probes/probe.port.js";
import { MEASURED_ROUTES } from "../measured-routes.js";
import { MeasureRouteTimingsHandler } from "../measure-route-timings.handler.js";
import { RouteTimingTransport, type TransportOutcome } from "../route-timing-transport.port.js";

const SECRET = "secret-de-test";
const BASE = "https://passerelle.test/api/lfd/";

/** La configuration posée à la main, sans dépendre du `.env` du poste. */
class DiagnosticConfig extends AppConfig {
  constructor(
    private readonly secret: string | null,
    private readonly base: string | null,
  ) {
    super();
  }

  override diagnosticSecret(): string | null {
    return this.secret;
  }

  override diagnosticBaseUrl(): string | null {
    return this.base;
  }
}

interface Call {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

/** Le transport doublé : retient chaque appel, rend la réponse que la règle donne. */
class ScriptedTransport extends RouteTimingTransport {
  readonly calls: Call[] = [];

  constructor(private readonly answer: (url: string, index: number) => TransportOutcome) {
    super();
  }

  get(
    url: string,
    headers: Readonly<Record<string, string>>,
    timeoutMs: number,
  ): Promise<TransportOutcome> {
    this.calls.push({ url, headers, timeoutMs });
    return Promise.resolve(this.answer(url, this.calls.length - 1));
  }
}

// L'instant n'est comparé qu'à lui-même : il ne juge rien.
const NOW = new Date(1_755_600_000_000);

function handler(config: AppConfig, transport: RouteTimingTransport): MeasureRouteTimingsHandler {
  return new MeasureRouteTimingsHandler(
    config,
    transport,
    new FixedStopwatch(12.34),
    new FixedClock(NOW),
  );
}

const OK: TransportOutcome = {
  kind: "response",
  status: 200,
  serverTiming: 'app;dur=8.2, worker;dur=1;desc="hit"',
  shelfCache: "hit",
};

describe("MeasureRouteTimingsHandler", () => {
  it("sans secret, n'appelle rien et se dit non configuré", async () => {
    const transport = new ScriptedTransport(() => OK);

    const report = await handler(new DiagnosticConfig(null, BASE), transport).execute();

    expect(report).toEqual({ generatedAt: NOW.toISOString(), state: "secret-missing", routes: [] });
    expect(transport.calls).toEqual([]);
  });

  it("sans adresse, n'appelle rien et le dit", async () => {
    const transport = new ScriptedTransport(() => OK);

    const report = await handler(new DiagnosticConfig(SECRET, null), transport).execute();

    expect(report.state).toBe("base-url-missing");
    expect(transport.calls).toEqual([]);
  });

  it("appelle chaque route deux fois, avec le secret et le délai des sondes", async () => {
    const transport = new ScriptedTransport(() => OK);

    const report = await handler(new DiagnosticConfig(SECRET, BASE), transport).execute();

    expect(report.state).toBe("measured");
    expect(transport.calls.map((call) => call.url)).toEqual(
      MEASURED_ROUTES.flatMap((route) => [
        `https://passerelle.test/api/lfd${route.path}`,
        `https://passerelle.test/api/lfd${route.path}`,
      ]),
    );
    expect(transport.calls.every((call) => call.headers["x-lfd-diagnostic"] === SECRET)).toBe(true);
    expect(transport.calls.every((call) => call.timeoutMs === PROBE_TIMEOUT_MS)).toBe(true);
    expect(report.routes[0]).toEqual({
      key: MEASURED_ROUTES[0]?.key,
      path: MEASURED_ROUTES[0]?.path,
      passes: [1, 2].map((pass) => ({
        pass,
        status: 200,
        totalMs: 12.3,
        marks: [
          { name: "app", durationMs: 8.2, description: null },
          { name: "worker", durationMs: 1, description: "hit" },
        ],
        shelfCache: "hit",
        failure: null,
      })),
    });
  });

  it("ne rend jamais le secret dans le rapport", async () => {
    const transport = new ScriptedTransport(() => OK);

    const report = await handler(new DiagnosticConfig(SECRET, BASE), transport).execute();

    expect(JSON.stringify(report)).not.toContain(SECRET);
  });

  it("rend une route en erreur avec son statut, et un délai dépassé sans réponse", async () => {
    const transport = new ScriptedTransport((url, index) => {
      if (url.endsWith("/health")) {
        return index % 2 === 0 ? { kind: "timeout" } : { kind: "unreachable" };
      }
      return { kind: "response", status: 503, serverTiming: null, shelfCache: null };
    });

    const report = await handler(new DiagnosticConfig(SECRET, BASE), transport).execute();

    const health = report.routes.find((route) => route.key === "health");
    expect(health?.passes.map((pass) => [pass.status, pass.failure])).toEqual([
      [null, "timeout"],
      [null, "unreachable"],
    ]);
    const shelf = report.routes.find((route) => route.key === "shelf-public");
    expect(shelf?.passes.map((pass) => [pass.status, pass.marks, pass.failure])).toEqual([
      [503, [], null],
      [503, [], null],
    ]);
  });
});
