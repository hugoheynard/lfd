import type { PrismaClient } from "../../platform/database/client/client.js";

/**
 * **Les références de vente des articles que le semis nomme**
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, L3).
 *
 * Le corpus nomme ses articles par leur référence PRODUIT (`VIE-001`), lisible
 * et stable d'un semis du référentiel à l'autre. Depuis la bascule, la
 * boutique vend chaque déclinaison sous SA référence (`VIE-001-1`) : le semis
 * écrit donc celle du défaut de la fiche, lue au miroir du catalogue — jamais
 * déduite d'un suffixe. Une référence qui est déjà celle d'un article reste
 * telle quelle ; une référence inconnue aussi, et le refus réel du handler la
 * nommera.
 *
 * Une base de dev semée APRÈS la migration de bascule n'a pas d'alias pour ses
 * fiches (elles n'existaient pas ce jour-là) : la porte d'entrée ne traduirait
 * rien, d'où cette traduction au semis.
 */
export async function saleSkusOf(
  prisma: PrismaClient,
  skus: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const wanted = [...new Set(skus)];
  if (wanted.length === 0) {
    return new Map();
  }
  // withdrawn-filter: exempt — une traduction de nom, pas une mise en vente :
  // un article retiré garde sa référence, et le handler le refusera.
  const defaults = await prisma.catalogItem.findMany({
    where: { productSku: { in: wanted }, isDefault: true },
    select: { sku: true, productSku: true },
  });
  const byProduct = new Map(defaults.map((row) => [row.productSku, row.sku]));
  return new Map(wanted.map((sku) => [sku, byProduct.get(sku) ?? sku]));
}

/** Les lignes du semis, chacune sous la référence de vente de son article. */
export async function withSaleSkus<Line extends { readonly sku: string }>(
  prisma: PrismaClient,
  lines: readonly Line[],
): Promise<Line[]> {
  const sale = await saleSkusOf(
    prisma,
    lines.map((line) => line.sku),
  );
  return lines.map((line) => ({ ...line, sku: sale.get(line.sku) ?? line.sku }));
}
