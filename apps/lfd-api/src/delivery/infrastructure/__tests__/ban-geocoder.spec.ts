import { GeocoderUnavailableError } from "../../domain/errors/delivery-routing-errors.js";
import type { GeocodeRequest } from "../../domain/ports/geocoder.js";
import { BAN_TIMEOUT_MS, BanGeocoder, type FetchFn } from "../ban-geocoder.js";
import { BAN_MIXED, BAN_NOT_CSV } from "./ban-responses.js";

const REQUESTS: readonly GeocodeRequest[] = [
  { key: "k0", street: "12 Rue de Boigne", postalCode: "73000", city: "Chambéry" },
  { key: "k1", street: "Place de l'Hôtel de Ville", postalCode: "73200", city: "Albertville" },
  { key: "k2", street: "Place de la Mairie", postalCode: "73000", city: "Chambéry" },
  { key: "k3", street: "Nulle part", postalCode: "00000", city: "Inconnue" },
];

/** Un `fetch` enregistré : il note ce qu'on lui demande, et rend la réponse donnée. */
class RecordedFetch {
  readonly calls: { readonly url: string; readonly init: RequestInit }[] = [];

  constructor(private readonly answer: () => Promise<Response>) {}

  readonly fetch: FetchFn = (url, init) => {
    this.calls.push({ url, init });
    return this.answer();
  };
}

const csv =
  (body: string, status = 200) =>
  () =>
    Promise.resolve(new Response(body, { status, headers: { "content-type": "text/csv" } }));

describe("le géocodage par la Base Adresse Nationale (L7-C9)", () => {
  it("rend un point par adresse trouvée avec assez de certitude, rien pour les autres", async () => {
    const recorded = new RecordedFetch(csv(BAN_MIXED));

    const answers = await new BanGeocoder("https://ban.test/", recorded.fetch).geocode(REQUESTS);

    expect(answers).toEqual([
      { key: "k0", point: { lat: 45.565378, lng: 5.920472 }, score: 0.9690854545454544 },
      { key: "k1", point: { lat: 45.675961, lng: 6.392458 }, score: 0.8121 },
      // Sous le seuil de 0,5 : « non situé » plutôt que le mauvais village.
      { key: "k2", point: null, score: 0.48935566844919776 },
      { key: "k3", point: null, score: 0 },
    ]);
  });

  it("envoie UN lot à /search/csv/, avec un délai, sans la clé du cache", async () => {
    const recorded = new RecordedFetch(csv(BAN_MIXED));

    await new BanGeocoder("https://ban.test/", recorded.fetch).geocode(REQUESTS);

    expect(recorded.calls).toHaveLength(1);
    const [call] = recorded.calls;
    expect(call?.url).toBe("https://ban.test/search/csv/");
    expect(call?.init.method).toBe("POST");
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
    const form = call?.init.body;
    expect(form).toBeInstanceOf(FormData);
    if (!(form instanceof FormData)) {
      return;
    }
    expect(form.getAll("columns")).toEqual(["street", "city"]);
    expect(form.get("postcode")).toBe("postcode");
    const file = form.get("data");
    const sent = file instanceof Blob ? await file.text() : "";
    expect(sent.split("\n")[0]).toBe("row,street,postcode,city");
    expect(sent).toContain("0,12 Rue de Boigne,73000,Chambéry");
    expect(sent).not.toContain("k0");
  });

  it("ne sort pas sur le réseau sans adresse à géocoder", async () => {
    const recorded = new RecordedFetch(csv(BAN_MIXED));

    expect(await new BanGeocoder("https://ban.test", recorded.fetch).geocode([])).toEqual([]);
    expect(recorded.calls).toHaveLength(0);
  });

  it("un délai dépassé est un refus nommé, jamais « rien trouvé »", async () => {
    const recorded = new RecordedFetch(() =>
      Promise.reject(new DOMException(`délai de ${String(BAN_TIMEOUT_MS)} ms`, "TimeoutError")),
    );

    await expect(
      new BanGeocoder("https://ban.test", recorded.fetch).geocode(REQUESTS),
    ).rejects.toThrow(GeocoderUnavailableError);
  });

  it("un service en erreur est un refus nommé", async () => {
    const recorded = new RecordedFetch(csv("indisponible", 503));

    await expect(
      new BanGeocoder("https://ban.test", recorded.fetch).geocode(REQUESTS),
    ).rejects.toThrow("La Base Adresse Nationale ne répond pas");
  });

  it("un réseau coupé est un refus nommé", async () => {
    const recorded = new RecordedFetch(() => Promise.reject(new TypeError("fetch failed")));

    await expect(
      new BanGeocoder("https://ban.test", recorded.fetch).geocode(REQUESTS),
    ).rejects.toThrow(GeocoderUnavailableError);
  });

  it("une réponse qui n'est pas le CSV attendu est une panne, pas une absence", async () => {
    const recorded = new RecordedFetch(csv(BAN_NOT_CSV));

    await expect(
      new BanGeocoder("https://ban.test", recorded.fetch).geocode(REQUESTS),
    ).rejects.toThrow(GeocoderUnavailableError);
  });
});
