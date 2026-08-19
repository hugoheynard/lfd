import type { CatalogAdminItemView } from "@lfd/contracts";

/**
 * Port de lecture du **paramétrage** — distinct de `CatalogReader` (ISP), et
 * pour une raison de fond, pas de commodité.
 *
 * La boutique lit ce qui est **vendable** ; le back-office doit voir aussi les
 * masqués, et voir **d'où vient** chaque prix. Fondre les deux donnerait un port
 * dont chaque appelant ignore la moitié, et surtout un `listSellable()` qui
 * finirait par rendre des articles masqués « parce que l'admin en a besoin ».
 */
export abstract class CatalogAdminReader {
  /** Tout le catalogue, masqués compris, dans l'ordre d'affichage. */
  abstract list(): Promise<CatalogAdminItemView[]>;
}
