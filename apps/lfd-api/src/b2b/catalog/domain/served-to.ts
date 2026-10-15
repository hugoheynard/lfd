import type { ShopAudience } from "./ports/catalog.reader.js";

/**
 * À qui un article se vend, tel que le référentiel le dit (C2 de
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md`). Une VALEUR
 * de donnée, recopiée du fait de la fiche.
 */
export type CatalogAudience = "pro" | "public" | "both";

const AUDIENCES: readonly CatalogAudience[] = ["pro", "public", "both"];

/** Ce que `servedTo` lit d'un article — la colonne d'audience et les deux masquages. */
export interface ServableItem {
  /** `null` = jamais reçue par un fait, lue `both` : ce que fait tout article avant l'audience. */
  readonly audience: CatalogAudience | null;
  readonly isHidden: boolean;
  readonly isHiddenPublic: boolean;
}

/**
 * **L'article est-il servi à ce lecteur ?** — la règle unique du masquage
 * (2a5, D3 du plan d'audience).
 *
 * Deux conditions, et les deux sont nécessaires : l'audience de l'article
 * contient celle du lecteur (décision de GAMME, prise au référentiel), ET la
 * plateforme ne l'a pas masqué pour lui (décision LOCALE, temporaire). Le
 * masquage ne fait donc que retirer : montrer aux pros un article que le
 * référentiel dit `public` est impossible depuis la plateforme (H5).
 *
 * 🔴 Elle remplace quatre lectures directes du masquage — le rayon, la fiche
 * et le lot de SKU (donc la commande), l'éditeur de vitrine, le résumé « en
 * vente », l'export. Une seule écriture, sans quoi un jour l'un des quatre
 * vendrait ce que les autres cachent.
 */
export function servedTo(item: ServableItem, viewer: ShopAudience): boolean {
  const audience = item.audience ?? "both";
  if (audience !== "both" && audience !== viewer) {
    return false;
  }
  return viewer === "pro" ? !item.isHidden : !item.isHiddenPublic;
}

/** L'article est-il servi à quelqu'un — un pro, un particulier, ou les deux ? */
export function servedToAnyone(item: ServableItem): boolean {
  return servedTo(item, "pro") || servedTo(item, "public");
}

/**
 * La colonne relue. Une valeur inconnue se lit `null` — donc `both`, ce que
 * faisait l'article avant l'audience — plutôt que de lever sur une lecture de
 * rayon : le `CHECK` en base la refuse déjà à l'écriture.
 */
export function catalogAudienceOf(raw: string | null): CatalogAudience | null {
  return AUDIENCES.find((candidate) => candidate === raw) ?? null;
}
