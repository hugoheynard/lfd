import { ContainerMetricsUnavailableError } from "../container-metrics-errors.js";
import {
  ContainerMetricsReader,
  type ContainerMetricsResult,
} from "../container-metrics-reader.port.js";
import { ContainerUsageService } from "../container-usage.service.js";

const NOW = new Date(Date.parse("2030-01-01T12:05:30.000Z"));

/** Le port doublé à la main : il rend ce qu'on lui donne et note les fenêtres demandées. */
class ScriptedReader extends ContainerMetricsReader {
  readonly asked: { readonly from: string; readonly to: string }[] = [];

  constructor(private readonly answer: () => Promise<ContainerMetricsResult>) {
    super();
  }

  read(from: Date, to: Date): Promise<ContainerMetricsResult> {
    this.asked.push({ from: from.toISOString(), to: to.toISOString() });
    return this.answer();
  }
}

describe("ContainerUsageService", () => {
  it("lit la fenêtre de la carte et rend l'usage", async () => {
    const reader = new ScriptedReader(() =>
      Promise.resolve({
        kind: "samples",
        samples: [
          {
            minute: "2030-01-01T12:03:00.000Z",
            instanceId: "i-1",
            cpuTimeSec: 3,
            maxMemoryBytes: 1024 ** 3,
          },
        ],
      }),
    );

    const report = await new ContainerUsageService(reader).read(NOW, 5);

    expect(reader.asked).toEqual([
      { from: "2030-01-01T12:00:30.000Z", to: "2030-01-01T12:05:30.000Z" },
    ]);
    expect(report.gap).toBeNull();
    expect(report.usage).toMatchObject({ cpuPercent: 10, memoryPercent: 25, instances: 1 });
  });

  it("non configuré → une raison qui nomme la variable, pas une erreur", async () => {
    const reader = new ScriptedReader(() =>
      Promise.resolve({
        kind: "not-configured",
        setting: "CLOUDFLARE_API_CONTAINER_APPLICATION_ID",
      }),
    );

    const report = await new ContainerUsageService(reader).read(NOW, 5);

    expect(report.usage).toBeNull();
    expect(report.gap?.reason).toBe("not-configured");
    expect(report.gap?.detail).toContain("CLOUDFLARE_API_CONTAINER_APPLICATION_ID");
  });

  it("fenêtre vide → « aucune minute remontée », pas 0 %", async () => {
    const reader = new ScriptedReader(() => Promise.resolve({ kind: "samples", samples: [] }));

    const report = await new ContainerUsageService(reader).read(NOW, 5);

    expect(report).toMatchObject({ usage: null, gap: { reason: "no-samples" } });
  });

  it("un refus de droits devient une raison, jamais un 500", async () => {
    const reader = new ScriptedReader(() =>
      Promise.reject(new ContainerMetricsUnavailableError("forbidden", "posez la permission")),
    );

    const report = await new ContainerUsageService(reader).read(NOW, 5);

    expect(report).toEqual({
      usage: null,
      gap: { reason: "forbidden", detail: "posez la permission" },
    });
  });

  it("ne garde pas un échec en cache : la lecture suivante retente", async () => {
    let calls = 0;
    const reader = new ScriptedReader(() => {
      calls += 1;
      return Promise.reject(new ContainerMetricsUnavailableError("unavailable", "injoignable"));
    });
    const service = new ContainerUsageService(reader);

    await service.read(NOW, 5);
    await service.read(NOW, 5);

    expect(calls).toBe(2);
  });

  it("réutilise une lecture réussie de moins de trente secondes", async () => {
    const reader = new ScriptedReader(() => Promise.resolve({ kind: "samples", samples: [] }));
    const service = new ContainerUsageService(reader);

    await service.read(NOW, 5);
    await service.read(new Date(NOW.getTime() + 10_000), 5);

    expect(reader.asked).toHaveLength(1);
  });
});
