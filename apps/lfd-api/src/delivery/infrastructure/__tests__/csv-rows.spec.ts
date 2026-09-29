import { csvField, csvRows } from "../csv-rows.js";

describe("lire le CSV de la BAN", () => {
  it("lit les guillemets doublés, les virgules et les retours dans un champ", () => {
    expect(csvRows('a,b\r\n"x, ""y""","deux\nlignes"\n')).toEqual([
      ["a", "b"],
      ['x, "y"', "deux\nlignes"],
    ]);
  });

  it("ignore les lignes vides, garde les champs vides", () => {
    expect(csvRows("a,,c\n\n")).toEqual([["a", "", "c"]]);
  });

  it("écrit un champ qui en a besoin entre guillemets", () => {
    expect(csvField('dit "oui", puis')).toBe('"dit ""oui"", puis"');
    expect(csvField("simple")).toBe("simple");
  });
});
