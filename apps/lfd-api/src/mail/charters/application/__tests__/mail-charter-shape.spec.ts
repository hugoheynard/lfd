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
