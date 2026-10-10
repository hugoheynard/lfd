import {
  buildLocalized,
  InvalidLocalizedTextError,
  localizedColumn,
  readLocalizedColumn,
  readOptionalLocalizedColumn,
  type Languages,
} from "../localized-text.js";
import { CorruptedRecordError } from "../../database/json-columns.js";

/** Une liste de langues de test — la plateforme ne connaît pas celle du catalogue. */
const LANGUAGES: Languages<"fr", "fr" | "en" | "it"> = { source: "fr", all: ["fr", "en", "it"] };

/**
 * La mécanique est montée du référentiel le 2026-10-10. Ces cas figent ce
 * qu'elle faisait AVANT : un déménagement ne change pas une lecture.
 */
describe("buildLocalized", () => {
  it("rogne, et traite une traduction blanche comme absente", () => {
    expect(buildLocalized(LANGUAGES, "nom", { fr: " Pain ", en: "  ", it: "Pane" })).toEqual({
      fr: "Pain",
      it: "Pane",
    });
  });

  it("refuse un texte sans langue source", () => {
    expect(() => buildLocalized(LANGUAGES, "nom", { fr: "  ", en: "Bread" })).toThrow(
      InvalidLocalizedTextError,
    );
  });

  it("ignore une langue hors de la liste", () => {
    expect(buildLocalized(LANGUAGES, "nom", { fr: "Pain" })).toEqual({ fr: "Pain" });
  });
});

describe("readLocalizedColumn", () => {
  it("relit sans retoucher, et garde une source vide comme avant", () => {
    expect(readLocalizedColumn(LANGUAGES, { fr: "", en: " Bread " }, "nom")).toEqual({
      fr: "",
      en: " Bread ",
    });
  });

  it.each([null, [], "fr", { en: "Bread" }, { fr: 3 }])("refuse %p comme corrompu", (value) => {
    expect(() => readLocalizedColumn(LANGUAGES, value, "nom")).toThrow(CorruptedRecordError);
  });
});

describe("readOptionalLocalizedColumn", () => {
  it("rend null sans source non blanche", () => {
    expect(readOptionalLocalizedColumn(LANGUAGES, { fr: "  ", en: "Bread" })).toBeNull();
    expect(readOptionalLocalizedColumn(LANGUAGES, null)).toBeNull();
  });

  it("relit toutes les langues de la liste — l'italien compris", () => {
    expect(readOptionalLocalizedColumn(LANGUAGES, { fr: "Pain", it: "Pane", de: "Brot" })).toEqual({
      fr: "Pain",
      it: "Pane",
    });
  });
});

describe("localizedColumn", () => {
  it("écrit les traductions rognées et la source telle quelle", () => {
    expect(localizedColumn(LANGUAGES, { fr: "Pain ", en: " Bread", it: " " })).toEqual({
      fr: "Pain ",
      en: "Bread",
    });
  });
});
