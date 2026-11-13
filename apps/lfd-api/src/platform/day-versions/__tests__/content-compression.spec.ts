import { packContent, unpackContent } from "../content-compression.js";

/**
 * La compression des contenus rangés dans l'objet : un aller-retour rend le
 * même JSON, une entrée rangée en clair se lit encore, des octets corrompus
 * rendent `null` (un raté) sans lever.
 */
describe("packContent / unpackContent", () => {
  it("un aller-retour rend le même corps, accents compris", async () => {
    const json = JSON.stringify({ name: "Pain de campagne — 500 g", items: [1, 2, 3] });

    const packed = await packContent(json);

    expect(packed.rawBytes).toBe(new TextEncoder().encode(json).byteLength);
    await expect(unpackContent(packed.bytes)).resolves.toBe(json);
  });

  it("compresse une charge répétitive bien en dessous de sa taille en clair", async () => {
    const json = JSON.stringify(
      Array.from({ length: 2000 }, (_, i) => ({ id: i, name: "Baguette" })),
    );

    const packed = await packContent(json);

    expect(packed.bytes.byteLength).toBeLessThan(packed.rawBytes / 5);
  });

  it("lit une entrée rangée en JSON clair (sans en-tête gzip)", async () => {
    await expect(unpackContent(new TextEncoder().encode('{"a":1}'))).resolves.toBe('{"a":1}');
  });

  it("rend null sur un gzip tronqué ou corrompu", async () => {
    const packed = await packContent('{"a":"bonjour"}');

    await expect(unpackContent(packed.bytes.slice(0, 8))).resolves.toBeNull();
    await expect(unpackContent(new Uint8Array([0x1f, 0x8b, 0xff, 0xff]))).resolves.toBeNull();
  });

  it("rend null sur des octets qui ne sont pas de l'UTF-8", async () => {
    await expect(unpackContent(new Uint8Array([0xff, 0xfe, 0xfd]))).resolves.toBeNull();
  });
});
