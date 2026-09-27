import type { TrafficReport } from "@lfd/ops-contract";

import { ReadTrafficHandler } from "../read-traffic.handler.js";
import { ReadTrafficQuery } from "../read-traffic.query.js";
import { DEFAULT_WINDOW_MINUTES, MAX_WINDOW_MINUTES } from "../traffic-query.js";
import { TrafficReader } from "../traffic-reader.port.js";

const EMPTY: TrafficReport = {
  generatedAt: "t",
  source: "rehearsal",
  windows: [],
  series: [],
};

class RecordingReader extends TrafficReader {
  readonly asked: number[] = [];
  read(minutes: number): Promise<TrafficReport> {
    this.asked.push(minutes);
    return Promise.resolve(EMPTY);
  }
}

describe("ReadTrafficHandler", () => {
  it("lit la fenêtre demandée et rend le rapport du lecteur", async () => {
    const reader = new RecordingReader();

    const report = await new ReadTrafficHandler(reader).execute(new ReadTrafficQuery("15"));

    expect(reader.asked).toEqual([15]);
    expect(report).toBe(EMPTY);
  });

  it("retombe sur la fenêtre par défaut quand la saisie est absente ou illisible", async () => {
    const reader = new RecordingReader();
    const handler = new ReadTrafficHandler(reader);

    await handler.execute(new ReadTrafficQuery(undefined));
    await handler.execute(new ReadTrafficQuery("beaucoup"));

    expect(reader.asked).toEqual([DEFAULT_WINDOW_MINUTES, DEFAULT_WINDOW_MINUTES]);
  });

  it("borne une fenêtre trop large plutôt que de la refuser", async () => {
    const reader = new RecordingReader();

    await new ReadTrafficHandler(reader).execute(new ReadTrafficQuery("999999"));

    expect(reader.asked).toEqual([MAX_WINDOW_MINUTES]);
  });
});
