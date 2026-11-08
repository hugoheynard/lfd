import { parseMailCharterSettings } from "../mail-charter-shape.js";
import { STARTING_SETTINGS } from "./mail-charter-doubles.js";

describe("parseMailCharterSettings — la couleur du bandeau (2026-11-07)", () => {
  it("relit une charte rangée avant le bandeau avec sa couleur principale : son rendu ne change pas", () => {
    const { band: _band, ...before } = STARTING_SETTINGS.colors;
    const stored = { ...STARTING_SETTINGS, colors: { ...before, primary: "#7a1f3d" } };
    expect(parseMailCharterSettings(stored)?.colors.band).toBe("#7a1f3d");
  });

  it("garde le bandeau d'une charte qui en porte un", () => {
    expect(parseMailCharterSettings(STARTING_SETTINGS)?.colors.band).toBe("#1a3157");
  });

  it("refuse toujours ce qui n'a pas la forme d'une charte", () => {
    expect(parseMailCharterSettings({ couleurs: "bleu" })).toBeNull();
  });
});

describe("parseMailCharterSettings — la police du texte (2026-11-08)", () => {
  it("relit une charte rangée avant la police du texte : sans police, la pile système", () => {
    const { textFont: _textFont, ...before } = STARTING_SETTINGS;
    expect(parseMailCharterSettings(before)?.textFont).toBeNull();
  });

  it("garde la police du texte d'une charte qui en porte une", () => {
    const textFont = {
      family: "Pogonia",
      url: "https://lfc.test/brand/fonts/pogonia-400.woff2",
      fallback: "Arial, sans-serif",
    };
    expect(parseMailCharterSettings({ ...STARTING_SETTINGS, textFont })?.textFont).toEqual(
      textFont,
    );
  });

  it("relit les graisses d'une police, et une police rangée sans graisses telle quelle", () => {
    const textFont = {
      family: "Pogonia",
      url: "https://lfc.test/brand/fonts/pogonia-400.woff2",
      fallback: "Arial, sans-serif",
    };
    const weighted = { ...textFont, weights: { "700": "https://lfc.test/p-700.woff2" } };
    expect(parseMailCharterSettings({ ...STARTING_SETTINGS, textFont })?.textFont).toEqual(
      textFont,
    );
    expect(
      parseMailCharterSettings({ ...STARTING_SETTINGS, textFont: weighted })?.textFont,
    ).toEqual(weighted);
  });
});
