import type { Prisma } from "../../../../platform/database/client/client.js";
import { clientNoteOf } from "../../domain/services/delivery-note-sheet.js";
import {
  HEAD,
  plannedNote,
  PRO_BILLING,
} from "../../domain/services/__tests__/delivery-note-sheet.fixture.js";
import type { RenderedClientNote } from "../../domain/services/rendered-client-note.js";
import {
  causeOf,
  DeliveryNoteVersionShapeError,
  DeliveryNoteVersionUnreadableError,
  renderedJson,
  renderedOf,
} from "../delivery-note-version.json.js";

/**
 * **L'entrée figée d'une version, aller et retour** (plan du reliquat,
 * § 5 ter) : elle se relit exactement comme elle a été écrite, et une forme
 * que le schéma amputerait est refusée — à l'écriture comme à la lecture —
 * plutôt que de rendre un papier différent de celui qui est sorti.
 */
const RENDERED: RenderedClientNote = {
  note: clientNoteOf(plannedNote().toState(), HEAD, PRO_BILLING),
  undelivered: [{ productName: "Croissant", quantity: 2, saleUnit: "piece" }],
};

function isJsonObject(value: unknown): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ce que la base rend : l'écriture, passée par JSON. */
function stored(): Prisma.JsonObject {
  const back: unknown = JSON.parse(JSON.stringify(renderedJson(RENDERED)));
  if (!isJsonObject(back)) {
    throw new TypeError("l'entrée rangée n'est pas un objet");
  }
  return back;
}

describe("renderedJson / renderedOf", () => {
  it("se relit à l'identique après un passage par JSON", () => {
    expect(renderedOf("dn_1", 1, stored())).toEqual(RENDERED);
  });

  it("refuse d'écrire une composition qui porte un champ inconnu du schéma", () => {
    const widened = { ...RENDERED, note: { ...RENDERED.note, extra: "perdu" } };
    expect(() => renderedJson(widened)).toThrow(DeliveryNoteVersionShapeError);
  });

  it("refuse de relire une version amputable ou mal formée", () => {
    expect(() => renderedOf("dn_1", 1, { ...stored(), extra: 1 })).toThrow(
      DeliveryNoteVersionUnreadableError,
    );
    expect(() => renderedOf("dn_1", 1, { note: null, undelivered: [] })).toThrow(
      DeliveryNoteVersionUnreadableError,
    );
  });
});

describe("renderedJson / renderedOf — chemins de bord", () => {
  it("garde une entrée sans ligne non livrée et une ligne vendue au poids", () => {
    const empty: RenderedClientNote = { ...RENDERED, undelivered: [] };
    const reread: unknown = JSON.parse(JSON.stringify(renderedJson(empty)));
    expect(renderedOf("dn_1", 1, reread as Prisma.JsonValue)).toEqual(empty);
    const weight: RenderedClientNote = {
      ...RENDERED,
      undelivered: [{ productName: "Farine", quantity: 1500, saleUnit: "weight" }],
    };
    expect(renderedJson(weight)).toEqual(weight);
  });

  it.each([
    ["une quantité décimale", { productName: "Pain", quantity: 1.5, saleUnit: "piece" }],
    ["une quantité négative", { productName: "Pain", quantity: -1, saleUnit: "piece" }],
    ["une unité de vente inconnue", { productName: "Pain", quantity: 1, saleUnit: "box" }],
    [
      "un champ en trop sur la ligne",
      { productName: "Pain", quantity: 1, saleUnit: "piece", x: 1 },
    ],
  ])("refuse de relire une ligne non livrée avec %s", (_cas, line) => {
    expect(() => renderedOf("dn_1", 1, { ...stored(), undelivered: [line] })).toThrow(
      DeliveryNoteVersionUnreadableError,
    );
  });

  it.each([null, "texte", 3, []])(
    "refuse de relire une valeur rangée qui n'est pas un objet (%j)",
    (raw) => {
      expect(() => renderedOf("dn_1", 1, raw)).toThrow(DeliveryNoteVersionUnreadableError);
    },
  );

  it("relit une entrée dont les clés sont rangées dans un autre ordre", () => {
    const { note, undelivered } = stored();
    expect(renderedOf("dn_1", 1, { undelivered, note })).toEqual(RENDERED);
  });

  it("l'erreur de lecture nomme le bon et la version", () => {
    expect(() => causeOf("dn_9", 7, "printed")).toThrow(/version 7 du bon dn_9/);
  });

  it("l'erreur d'écriture nomme le numéro du bon", () => {
    const widened = { ...RENDERED, note: { ...RENDERED.note, extra: 1 } };
    expect(() => renderedJson(widened)).toThrow(new RegExp(RENDERED.note.number));
  });
});

describe("causeOf", () => {
  it("relit les trois causes et refuse le reste", () => {
    expect(causeOf("dn_1", 1, "born")).toBe("born");
    expect(causeOf("dn_1", 2, "departure_decided")).toBe("departure_decided");
    expect(causeOf("dn_1", 3, "replanned")).toBe("replanned");
    expect(() => causeOf("dn_1", 4, "printed")).toThrow(DeliveryNoteVersionUnreadableError);
  });
});
