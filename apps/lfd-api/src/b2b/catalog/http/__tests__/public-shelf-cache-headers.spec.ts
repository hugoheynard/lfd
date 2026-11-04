import {
  offerPublicShelf,
  PUBLIC_SHELF_CACHE_CONTROL,
  PUBLIC_SHELF_CACHE_TAG,
  type PublicShelfHeaderSink,
} from "../public-shelf-cache-headers.js";

/**
 * L'en-tête d'un rayon public (C3, § 3 et § 6). Ces tests échouent si la
 * durée quitte 30 s, si l'étiquette que le Worker purge change, ou si une
 * réponse non cacheable écrase le `private` du middleware.
 */
class RecordingSink implements PublicShelfHeaderSink {
  readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }
}

describe("offerPublicShelf", () => {
  it("cacheable : public 30 s, étiqueté rayon-public — exactement", () => {
    const sink = new RecordingSink();

    offerPublicShelf(sink, { view: {}, cacheable: true });

    expect(PUBLIC_SHELF_CACHE_CONTROL).toBe("public, max-age=30");
    expect(PUBLIC_SHELF_CACHE_TAG).toBe("rayon-public");
    expect([...sink.headers]).toEqual([
      ["Cache-Control", "public, max-age=30"],
      ["Cache-Tag", "rayon-public"],
    ]);
  });

  it("non cacheable : ne touche à rien, l'en-tête du middleware reste", () => {
    const sink = new RecordingSink();
    sink.setHeader("Cache-Control", "private, no-cache");

    offerPublicShelf(sink, { view: {}, cacheable: false });

    expect([...sink.headers]).toEqual([["Cache-Control", "private, no-cache"]]);
  });
});
