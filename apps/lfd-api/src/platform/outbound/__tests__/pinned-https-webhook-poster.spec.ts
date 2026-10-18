import { HostResolver, type ResolvedAddress } from "../host-resolver.js";
import { PinnedHttpsWebhookPoster } from "../pinned-https-webhook-poster.js";

/** Un DNS joué : rend ce qu'on lui dit, et compte les appels. */
class StaticResolver extends HostResolver {
  calls = 0;

  constructor(private readonly answer: readonly ResolvedAddress[] | Error) {
    super();
  }

  resolve(): Promise<readonly ResolvedAddress[]> {
    this.calls += 1;
    return this.answer instanceof Error
      ? Promise.reject(this.answer)
      : Promise.resolve(this.answer);
  }
}

const POST = { body: "{}", headers: {} };

/**
 * Le relais refuse AVANT toute connexion : aucun de ces cas n'ouvre de
 * socket — les adresses visées n'existent pas, ou sont la machine elle-même.
 */
describe("le relais sortant épinglé refuse avant de se connecter", () => {
  it("refuse http et une adresse illisible", async () => {
    const poster = new PinnedHttpsWebhookPoster(new StaticResolver([]));
    expect(await poster.post({ ...POST, url: "http://agence.example/" })).toMatchObject({
      kind: "refused",
    });
    expect(await poster.post({ ...POST, url: "pas une url" })).toMatchObject({ kind: "refused" });
  });

  it("refuse un nom qui se résout en bouclage (rebinding vers la machine)", async () => {
    const resolver = new StaticResolver([{ address: "127.0.0.1", family: 4 }]);
    const outcome = await new PinnedHttpsWebhookPoster(resolver).post({
      ...POST,
      url: "https://agence.example/hook",
    });
    expect(outcome).toEqual({
      kind: "refused",
      reason: "agence.example désigne une adresse de bouclage (cette machine) (127.0.0.1)",
    });
    expect(resolver.calls).toBe(1);
  });

  it("refuse dès qu'UNE des adresses du nom est privée", async () => {
    const resolver = new StaticResolver([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    expect(
      await new PinnedHttpsWebhookPoster(resolver).post({
        ...POST,
        url: "https://agence.example/",
      }),
    ).toMatchObject({ kind: "refused" });
  });

  it.each([
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/hook",
    "https://192.168.0.1/hook",
    "https://[fe80::1]/hook",
  ])("refuse une adresse littérale fermée, sans DNS : %s", async (url) => {
    const resolver = new StaticResolver([]);
    expect(await new PinnedHttpsWebhookPoster(resolver).post({ ...POST, url })).toMatchObject({
      kind: "refused",
    });
    expect(resolver.calls).toBe(0);
  });

  it("un nom introuvable est injoignable, pas refusé", async () => {
    const poster = new PinnedHttpsWebhookPoster(new StaticResolver(new Error("ENOTFOUND")));
    expect(await poster.post({ ...POST, url: "https://inconnu.example/" })).toMatchObject({
      kind: "unreachable",
    });
  });
});
