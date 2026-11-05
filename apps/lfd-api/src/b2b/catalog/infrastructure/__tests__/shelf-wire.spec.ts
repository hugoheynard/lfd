import type { ShopCatalogueView } from "@lfd/contracts";

import { packedShelf, unpackedShelf } from "../shelf-wire.js";

const VIEW: ShopCatalogueView = { shelves: [], items: [], operations: [] };
/** Les deux premiers octets d'un flux gzip (RFC 1952, § 2.3.1). */
const GZIP_MAGIC = [0x1f, 0x8b];

/** Le rayon tel qu'il passe le fil vers l'objet, et en revient. */
describe("shelf-wire — le rayon compressé", () => {
  it("part en gzip : l'objet range les octets compressés", async () => {
    const bytes = await packedShelf(VIEW);

    expect(Array.from(bytes.subarray(0, 2))).toEqual(GZIP_MAGIC);
  });

  it("revient identique après l'aller-retour", async () => {
    await expect(unpackedShelf(await packedShelf(VIEW))).resolves.toEqual(VIEW);
  });

  it("refuse des octets en clair — un rayon jamais compressé n'est pas un rayon", async () => {
    const plain = new TextEncoder().encode(JSON.stringify(VIEW));

    await expect(unpackedShelf(plain)).resolves.toBeNull();
  });
});
