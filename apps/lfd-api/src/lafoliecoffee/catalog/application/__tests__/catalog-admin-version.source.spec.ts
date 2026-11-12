import { CatalogAdminChangeVersionReader } from "../../domain/ports/catalog-admin-change-version.reader.js";
import {
  CATALOG_ADMIN_FRESH_MS,
  CatalogAdminVersionSource,
} from "../catalog-admin-version.source.js";

class FixedReader extends CatalogAdminChangeVersionReader {
  versionOf(): Promise<number> {
    return Promise.resolve(23);
  }
}

describe("CatalogAdminVersionSource", () => {
  it("rend le numéro du journal de l'écran Catalogue, sous `lfc_catalog:read`, à 15 s", async () => {
    const source = new CatalogAdminVersionSource(new FixedReader());

    await expect(source.versionOf()).resolves.toBe(23);
    expect(source.subject).toBe("catalog-admin");
    expect(source.readers).toEqual(["lfc_catalog:read"]);
    expect(source.freshMs).toBe(CATALOG_ADMIN_FRESH_MS);
    expect(CATALOG_ADMIN_FRESH_MS).toBe(15_000);
  });
});
