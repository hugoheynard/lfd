import {
  RESERVED_GREEN_HUES,
  RESERVED_MIN_SATURATION,
  RESERVED_RED_HUES,
  SiteColor,
} from "../site-color.js";
import { SiteColorFormatError, SiteColorReservedError } from "../site-errors.js";

/** `#rrggbb` d'une couleur HSL pleinement saturée, de luminosité 50 %. */
function hueHex(hue: number): string {
  const f = (n: number): string => {
    const k = (n + hue / 30) % 12;
    const value = 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

describe("SiteColor — la forme", () => {
  it("accepte #rrggbb et le rend en minuscules", () => {
    expect(SiteColor.of("#1E40AF").hex).toBe("#1e40af");
  });

  it.each(["1e40af", "#1e40a", "#1e40afe", "#ggg000", "", "blue"])("refuse « %s »", (value) => {
    expect(() => SiteColor.of(value)).toThrow(SiteColorFormatError);
  });
});

describe("SiteColor — les teintes des surligneurs OK / KO", () => {
  it.each([
    ["bleu", "#2563eb"],
    ["jaune", "#facc15"],
    ["orange", "#f97316"],
    ["gris", "#9ca3af"],
    ["violet", "#7c3aed"],
    ["brun", "#92400e"],
  ])("accepte le %s de la demande (%s)", (_name, hex) => {
    expect(SiteColor.of(hex).hex).toBe(hex);
  });

  it.each([
    ["vert", "#16a34a"],
    ["rouge", "#dc2626"],
    ["rose", "#ec4899"],
  ])("refuse le %s (%s)", (_name, hex) => {
    expect(() => SiteColor.of(hex)).toThrow(SiteColorReservedError);
  });

  it("le message dit pourquoi : réservé aux surligneurs", () => {
    expect(() => SiteColor.of("#16a34a")).toThrow(/surligneurs OK \/ KO/u);
  });

  describe("les bornes du vert", () => {
    // Un degré À L'INTÉRIEUR : `#rrggbb` arrondit la teinte au 8 bits près,
    // une borne exacte ne s'écrit pas toujours.
    it("refuse juste à l'intérieur des deux bornes", () => {
      expect(() => SiteColor.of(hueHex(RESERVED_GREEN_HUES.from + 1))).toThrow(
        SiteColorReservedError,
      );
      expect(() => SiteColor.of(hueHex(RESERVED_GREEN_HUES.to - 1))).toThrow(
        SiteColorReservedError,
      );
    });

    it("accepte juste en dehors : le jaune-vert et le turquoise", () => {
      expect(SiteColor.of(hueHex(RESERVED_GREEN_HUES.from - 3))).toBeInstanceOf(SiteColor);
      expect(SiteColor.of(hueHex(RESERVED_GREEN_HUES.to + 3))).toBeInstanceOf(SiteColor);
    });
  });

  describe("les bornes du rouge et du rose, à cheval sur 0°", () => {
    it("refuse 0° et juste à l'intérieur des deux bornes", () => {
      expect(() => SiteColor.of(hueHex(0))).toThrow(SiteColorReservedError);
      expect(() => SiteColor.of(hueHex(RESERVED_RED_HUES.from + 1))).toThrow(
        SiteColorReservedError,
      );
      expect(() => SiteColor.of(hueHex(RESERVED_RED_HUES.to - 1))).toThrow(SiteColorReservedError);
    });

    it("accepte juste en dehors : le magenta et l'orange", () => {
      expect(SiteColor.of(hueHex(RESERVED_RED_HUES.from - 3))).toBeInstanceOf(SiteColor);
      expect(SiteColor.of(hueHex(RESERVED_RED_HUES.to + 3))).toBeInstanceOf(SiteColor);
    });
  });

  describe("la saturation minimale : un gris teinté n'est pas un surligneur", () => {
    it("accepte un gris à peine vert, sous le seuil", () => {
      // #7a8a7a : teinte 120°, saturation ≈ 0,06.
      expect(SiteColor.of("#7a8a7a").hex).toBe("#7a8a7a");
    });

    it("refuse un vert à peine au-dessus du seuil", () => {
      // Luminosité 50 % : saturation = (max − min) / 255.
      const spread = Math.ceil(RESERVED_MIN_SATURATION * 255) + 2;
      const low = Math.round((255 - spread) / 2);
      const channel = (n: number): string => n.toString(16).padStart(2, "0");
      const hex = `#${channel(low)}${channel(low + spread)}${channel(low)}`;
      expect(() => SiteColor.of(hex)).toThrow(SiteColorReservedError);
    });

    it("accepte le blanc et le noir", () => {
      expect(SiteColor.of("#ffffff").hex).toBe("#ffffff");
      expect(SiteColor.of("#000000").hex).toBe("#000000");
    });
  });
});
