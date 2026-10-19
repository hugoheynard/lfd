import {
  CONTAINER_METRICS_QUERY,
  isPermissionMessage,
  parseContainerMetrics,
} from "../container-metrics-query.js";

/** Forme recopiée de l'exemple de la doc Cloudflare, à la minute. */
const RESPONSE = {
  data: {
    viewer: {
      accounts: [
        {
          containersMetricsAdaptiveGroups: [
            {
              dimensions: { datetimeMinute: "2030-01-01T12:00:00Z", instanceId: "i-1" },
              sum: { cpuTimeSec: 12.5 },
              max: { memory: 312475648 },
            },
            {
              dimensions: { datetimeMinute: "2030-01-01T12:01:00Z", instanceId: "i-1" },
              sum: { cpuTimeSec: "beaucoup" },
              max: { memory: 1 },
            },
          ],
        },
      ],
    },
  },
  errors: null,
};

describe("parseContainerMetrics", () => {
  it("lit les minutes et écarte une ligne dont un nombre n'en est pas un", () => {
    expect(parseContainerMetrics(RESPONSE)).toEqual({
      kind: "samples",
      samples: [
        {
          minute: "2030-01-01T12:00:00Z",
          instanceId: "i-1",
          cpuTimeSec: 12.5,
          maxMemoryBytes: 312475648,
        },
      ],
    });
  });

  it("fait passer les erreurs GraphQL avant les données", () => {
    const parsed = parseContainerMetrics({
      ...RESPONSE,
      errors: [{ message: "not authorized for that account" }],
    });

    expect(parsed).toEqual({ kind: "errors", messages: ["not authorized for that account"] });
  });

  it("rend une fenêtre vide sur une forme inattendue, sans lever", () => {
    expect(parseContainerMetrics({ data: null })).toEqual({ kind: "samples", samples: [] });
    expect(parseContainerMetrics("rien")).toEqual({ kind: "samples", samples: [] });
  });
});

describe("isPermissionMessage", () => {
  it("reconnaît un refus de droits, et pas une autre erreur", () => {
    expect(isPermissionMessage("not authorized for that account")).toBe(true);
    expect(isPermissionMessage("unknown field applicationId")).toBe(false);
  });
});

describe("CONTAINER_METRICS_QUERY", () => {
  it("lit le temps CPU et le pic mémoire, par minute et par instance, d'UNE application", () => {
    for (const fragment of [
      "containersMetricsAdaptiveGroups",
      "applicationId: $applicationId",
      "datetimeMinute",
      "instanceId",
      "cpuTimeSec",
      "memory",
    ]) {
      expect(CONTAINER_METRICS_QUERY).toContain(fragment);
    }
  });
});
