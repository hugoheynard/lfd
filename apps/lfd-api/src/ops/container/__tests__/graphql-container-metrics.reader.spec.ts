import { AppConfig, type ContainerMetricsConfig } from "../../../platform/config/app-config.js";
import { ContainerMetricsUnavailableError } from "../container-metrics-errors.js";
import { GraphqlContainerMetricsReader } from "../graphql-container-metrics.reader.js";

/** Une configuration posée, sans dépendre du `.env` du poste. */
class ConfiguredAppConfig extends AppConfig {
  override containerMetricsConfig(): ContainerMetricsConfig {
    return { accountId: "compte", apiToken: "jeton", applicationId: "app-api" };
  }
}

class UnconfiguredAppConfig extends AppConfig {
  override containerMetricsConfig(): null {
    return null;
  }
}

interface Sent {
  readonly url: string;
  readonly body: string;
  readonly authorization: string | null;
}

/** Le réseau doublé à la main : on garde ce qui part, on rend la réponse donnée. */
function answering(sent: Sent[], status: number, body: unknown): typeof fetch {
  return (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    sent.push({
      url,
      body: typeof init?.body === "string" ? init.body : "",
      authorization: new Headers(init?.headers).get("Authorization"),
    });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
}

const FROM = new Date(Date.parse("2030-01-01T12:00:00.000Z"));
const TO = new Date(Date.parse("2030-01-01T12:05:00.000Z"));

const ONE_MINUTE = {
  data: {
    viewer: {
      accounts: [
        {
          containersMetricsAdaptiveGroups: [
            {
              dimensions: { datetimeMinute: "2030-01-01T12:01:00Z", instanceId: "i-1" },
              sum: { cpuTimeSec: 6 },
              max: { memory: 1024 },
            },
          ],
        },
      ],
    },
  },
  errors: null,
};

describe("GraphqlContainerMetricsReader", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("interroge l'API GraphQL avec le jeton, le compte, l'application et la fenêtre", async () => {
    const sent: Sent[] = [];
    globalThis.fetch = answering(sent, 200, ONE_MINUTE);

    const result = await new GraphqlContainerMetricsReader(new ConfiguredAppConfig()).read(
      FROM,
      TO,
    );

    expect(result).toEqual({
      kind: "samples",
      samples: [
        { minute: "2030-01-01T12:01:00Z", instanceId: "i-1", cpuTimeSec: 6, maxMemoryBytes: 1024 },
      ],
    });
    expect(sent[0]?.url).toBe("https://api.cloudflare.com/client/v4/graphql");
    expect(sent[0]?.authorization).toBe("Bearer jeton");
    expect(JSON.parse(sent[0]?.body ?? "{}")).toMatchObject({
      variables: {
        accountTag: "compte",
        applicationId: "app-api",
        from: FROM.toISOString(),
        to: TO.toISOString(),
      },
    });
  });

  it("un 403 est un refus de droits, qui nomme la permission à ajouter", async () => {
    globalThis.fetch = answering([], 403, {});

    const refusal = await new GraphqlContainerMetricsReader(new ConfiguredAppConfig())
      .read(FROM, TO)
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ContainerMetricsUnavailableError);
    expect(refusal).toMatchObject({
      failure: "forbidden",
      message: expect.stringContaining("Account Analytics: Read") as string,
    });
  });

  it("un refus de droits rendu en 200 dans `errors` est aussi un refus de droits", async () => {
    globalThis.fetch = answering([], 200, {
      data: null,
      errors: [{ message: "not authorized for that account" }],
    });

    const refusal = await new GraphqlContainerMetricsReader(new ConfiguredAppConfig())
      .read(FROM, TO)
      .catch((error: unknown) => error);

    expect(refusal).toMatchObject({ failure: "forbidden" });
  });

  it("une autre erreur GraphQL est une indisponibilité", async () => {
    globalThis.fetch = answering([], 200, { data: null, errors: [{ message: "unknown field" }] });

    const refusal = await new GraphqlContainerMetricsReader(new ConfiguredAppConfig())
      .read(FROM, TO)
      .catch((error: unknown) => error);

    expect(refusal).toMatchObject({ failure: "unavailable" });
  });

  it("n'appelle rien quand la lecture n'est pas configurée, et nomme la variable", async () => {
    const sent: Sent[] = [];
    globalThis.fetch = answering(sent, 200, ONE_MINUTE);

    const result = await new GraphqlContainerMetricsReader(new UnconfiguredAppConfig()).read(
      FROM,
      TO,
    );

    expect(sent).toEqual([]);
    expect(result).toMatchObject({
      kind: "not-configured",
      setting: expect.stringContaining("CLOUDFLARE_API_CONTAINER_APPLICATION_ID") as string,
    });
  });
});
