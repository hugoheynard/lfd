import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PIM_VERSIONED_TABLES } from "../../domain/pim-versioned-tables.js";

/**
 * **Les tables que lisent les contenus servis sous le numéro `pim` sont toutes
 * au numéro** (`le-cache-du-back-office.md`, § 5.2). Une table lue et absente de
 * `PIM_VERSIONED_TABLES` servirait une charge périmée sans que rien ne la
 * fasse relire.
 *
 * La lecture est STATIQUE : chaque adaptateur des lecteurs de la liste, du
 * détail et des référentiels est lu, et chaque accès de lecture
 * `.<modèle>.find…|count|aggregate|groupBy(` est rapporté à sa table par le
 * schéma Prisma. Ce qu'elle ne voit pas : les relations jointes par un
 * `include` ou un `select` imbriqué (`variants`, `allergenSheet`,
 * `contextVat`…) — leurs tables sont dans la liste, vérifié à la main le
 * 2026-11-12.
 */

const SRC = new URL("../../../", import.meta.url);
const SCHEMA = new URL("../../../../../prisma/schema/pim/", import.meta.url);

/** Les adaptateurs que lisent les contenus servis sous le numéro `pim`. */
const SERVED_ADAPTERS = [
  // La liste des produits et ses alertes.
  "catalogue/product/infrastructure/prisma-product.repository.ts",
  "catalogue/category/infrastructure/prisma-category.repository.ts",
  "catalogue/shared/infrastructure/prisma-catalogue-reader.ts",
  "catalogue/product/infrastructure/prisma-illustrated-products.reader.ts",
  "ingredients/infrastructure/prisma-cited-allergens.reader.ts",
  "sales-contexts/infrastructure/prisma-sales-context.registry.ts",
  // Le détail d'une fiche.
  "catalogue/product/infrastructure/prisma-editorial-reader.ts",
  "catalogue/product/infrastructure/prisma-readiness.repository.ts",
  "catalogue/product/infrastructure/prisma-detachment-lineage.reader.ts",
  // Les référentiels.
  "catalogue/category/infrastructure/prisma-product-count.reader.ts",
  "vat-rates/infrastructure/prisma-vat-rate.repository.ts",
  "sales-contexts/infrastructure/prisma-sales-context.repository.ts",
  "ingredients/infrastructure/prisma-appellation.repository.ts",
  "ingredients/infrastructure/prisma-ingredient.repository.ts",
  "allergens/infrastructure/prisma-allergen-catalogue.reader.ts",
] as const;

const READ_ACCESS =
  /\.([a-z][A-Za-z]*)\.(?:findMany|findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|count|aggregate|groupBy)\(/gu;

/** `model X { … @@map("x") }`, par nom d'accesseur (`productVariant` → `product_variant`). */
function tablesByAccessor(): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const file of readdirSync(SCHEMA)) {
    const text = readFileSync(new URL(file, SCHEMA), "utf8");
    for (const model of text.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gmu)) {
      const [, name = "", body = ""] = model;
      const table = /@@map\("([^"]+)"\)/u.exec(body)?.[1] ?? name;
      found.set(name.charAt(0).toLowerCase() + name.slice(1), table);
    }
  }
  return found;
}

function readTablesOf(adapter: string, tables: ReadonlyMap<string, string>): string[] {
  const text = readFileSync(fileURLToPath(new URL(adapter, SRC)), "utf8");
  return [...text.matchAll(READ_ACCESS)].flatMap(([, accessor = ""]) => {
    const table = tables.get(accessor);
    return table === undefined ? [] : [table];
  });
}

describe("PIM_VERSIONED_TABLES", () => {
  it("couvre chaque table que lisent les adaptateurs des contenus servis", () => {
    const tables = tablesByAccessor();
    const versioned = new Set<string>(PIM_VERSIONED_TABLES);

    const missing = SERVED_ADAPTERS.flatMap((adapter) =>
      readTablesOf(adapter, tables)
        .filter((table) => !versioned.has(table))
        .map((table) => `${adapter} lit ${table}`),
    );

    expect(missing).toEqual([]);
  });

  it("lit vraiment quelque chose : la lecture statique n'est pas vide", () => {
    const tables = tablesByAccessor();

    expect(readTablesOf(SERVED_ADAPTERS[0], tables)).toContain("product");
    expect(tables.get("pimChange")).toBe("pim_change");
  });

  it("ne nomme que des tables du schéma `pim`, sans doublon", () => {
    const known = new Set(tablesByAccessor().values());

    expect(PIM_VERSIONED_TABLES.filter((table) => !known.has(table))).toEqual([]);
    expect(new Set(PIM_VERSIONED_TABLES).size).toBe(PIM_VERSIONED_TABLES.length);
  });
});
