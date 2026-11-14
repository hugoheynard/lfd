import { assertOutsideTransaction } from "../../platform/database/outside-transaction.js";
import type { HttpGet } from "../probes/frontend.probe.js";
import { RouteTimingTransport, type TransportOutcome } from "./route-timing-transport.port.js";

/**
 * Le transport réel, sur `fetch`. Le corps est lu jusqu'au bout pour que la
 * durée mesurée couvre la réponse entière, puis jeté. Le `fetch` est injecté,
 * comme pour `FrontendProbe` : un test ne touche jamais au `fetch` global.
 */
export class FetchRouteTimingTransport extends RouteTimingTransport {
  constructor(private readonly http: HttpGet = (url, init) => fetch(url, init)) {
    super();
  }

  async get(
    url: string,
    headers: Readonly<Record<string, string>>,
    timeoutMs: number,
  ): Promise<TransportOutcome> {
    assertOutsideTransaction("mesure.route-timings");
    try {
      const response = await this.http(url, {
        headers: { ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      await response.arrayBuffer();
      return {
        kind: "response",
        status: response.status,
        serverTiming: response.headers.get("server-timing"),
        shelfCache: response.headers.get("x-shelf-cache"),
      };
    } catch (error) {
      return error instanceof DOMException && error.name === "TimeoutError"
        ? { kind: "timeout" }
        : { kind: "unreachable" };
    }
  }
}
