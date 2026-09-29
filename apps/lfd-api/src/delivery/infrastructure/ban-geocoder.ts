import { GeocoderUnavailableError } from "../domain/errors/delivery-routing-errors.js";
import { type GeocodeAnswer, Geocoder, type GeocodeRequest } from "../domain/ports/geocoder.js";
import { geoPoint } from "../domain/value-objects/geo-point.js";
import { csvField, csvRows } from "./csv-rows.js";

/** Au-delà, la BAN n'a pas répondu : on n'attend pas plus longtemps un tiers (L7-C9). */
export const BAN_TIMEOUT_MS = 5000;

/**
 * En dessous, la BAN n'est pas assez sûre : l'arrêt reste « non situé »
 * plutôt que d'être placé au mauvais village.
 */
export const BAN_MIN_SCORE = 0.5;

/** Ce que l'adaptateur appelle — `fetch`, ou une réponse enregistrée en test. */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/**
 * **Le géocodage par la Base Adresse Nationale** (`api-adresse.data.gouv.fr`,
 * L7-C1, L7-C9) : gratuite, sans clé, française.
 *
 * UN appel par lot — `POST /search/csv/` —, jamais une requête par adresse.
 * Seules partent la voie, le code postal et la ville, repérés par un numéro de
 * ligne : ni nom, ni contact, ni la clé du cache. Chaque appel porte un délai
 * de 5 s ; un service muet, lent, en erreur, ou une réponse illisible, et
 * c'est un refus nommé — l'appelant n'écrit rien.
 */
export class BanGeocoder extends Geocoder {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = (url, init) => fetch(url, init),
  ) {
    super();
  }

  async geocode(requests: readonly GeocodeRequest[]): Promise<readonly GeocodeAnswer[]> {
    if (requests.length === 0) {
      return [];
    }
    const text = await this.post(requests);
    return answersOf(text, requests);
  }

  /** @throws {GeocoderUnavailableError} */
  private async post(requests: readonly GeocodeRequest[]): Promise<string> {
    const lines = requests.map((request, index) =>
      [String(index), request.street, request.postalCode, request.city].map(csvField).join(","),
    );
    const form = new FormData();
    form.append(
      "data",
      new Blob([["row,street,postcode,city", ...lines].join("\n")], { type: "text/csv" }),
      "adresses.csv",
    );
    form.append("columns", "street");
    form.append("columns", "city");
    form.append("postcode", "postcode");
    for (const column of ["latitude", "longitude", "result_score"]) {
      form.append("result_columns", column);
    }
    try {
      const response = await this.fetchFn(`${this.baseUrl.replace(/\/+$/u, "")}/search/csv/`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(BAN_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new GeocoderUnavailableError();
      }
      return await response.text();
    } catch (error: unknown) {
      if (error instanceof GeocoderUnavailableError) {
        throw error;
      }
      throw new GeocoderUnavailableError();
    }
  }
}

/**
 * Lit la réponse **défensivement** : elle vient du réseau. Une réponse qui
 * n'a pas les colonnes attendues est une panne, pas « rien trouvé ».
 * @throws {GeocoderUnavailableError}
 */
function answersOf(text: string, requests: readonly GeocodeRequest[]): readonly GeocodeAnswer[] {
  const [header, ...rows] = csvRows(text);
  const column = (name: string): number => header?.indexOf(name) ?? -1;
  const [row, lat, lng, score] = ["row", "latitude", "longitude", "result_score"].map(column);
  if ([row, lat, lng, score].some((index) => index === undefined || index < 0)) {
    throw new GeocoderUnavailableError();
  }
  const cell = (cells: readonly string[], index: number | undefined): string =>
    index === undefined ? "" : (cells[index] ?? "");
  return rows.flatMap((cells) => {
    const request = requests[Number(cell(cells, row))];
    if (request === undefined) {
      return [];
    }
    return [answerOf(request.key, cell(cells, lat), cell(cells, lng), cell(cells, score))];
  });
}

function answerOf(key: string, lat: string, lng: string, score: string): GeocodeAnswer {
  const confidence = Number(score);
  if (lat === "" || lng === "" || !Number.isFinite(confidence) || confidence < BAN_MIN_SCORE) {
    return { key, point: null, score: Number.isFinite(confidence) ? confidence : 0 };
  }
  try {
    return { key, point: geoPoint(Number(lat), Number(lng)), score: confidence };
  } catch {
    // Une coordonnée hors des bornes terrestres ne situe rien : l'arrêt reste
    // « non situé », et l'écran le dit — on ne l'invente pas.
    return { key, point: null, score: confidence };
  }
}
