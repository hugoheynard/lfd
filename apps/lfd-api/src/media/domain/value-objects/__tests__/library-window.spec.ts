import { libraryWindow, UnsupportedLibraryOffsetError } from "../library-window.js";

describe("la fenêtre d'une page du fonds", () => {
  it("prend soixante images par défaut, à partir du début", () => {
    expect(libraryWindow({ withCursor: false, sort: "deposited" })).toEqual({
      limit: 60,
      offset: 0,
    });
  });

  it("borne la taille entre une et cent images, et le décalage à zéro", () => {
    expect(
      libraryWindow({ limit: 5000, offset: -3, withCursor: false, sort: "deposited" }),
    ).toEqual({ limit: 100, offset: 0 });
    expect(libraryWindow({ limit: 0, withCursor: false, sort: "deposited" }).limit).toBe(1);
  });

  it("refuse un décalage avec un curseur ou un autre tri que le dépôt", () => {
    expect(() => libraryWindow({ offset: 60, withCursor: true, sort: "deposited" })).toThrow(
      UnsupportedLibraryOffsetError,
    );
    expect(() => libraryWindow({ offset: 60, withCursor: false, sort: "uses" })).toThrow(
      UnsupportedLibraryOffsetError,
    );
  });
});
