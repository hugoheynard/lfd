import type { ShopCatalogueView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { CATALOG_SOURCE_LANGUAGE } from "../domain/catalog-translations.js";
import type { ShelfKey } from "../domain/ports/shop-shelf-cache.js";
import { ResilientShopShelfCache } from "./resilient-shop-shelf-cache.js";
import { ShopCataloguePricing } from "./shop-catalogue-pricing.service.js";

/**
 * Le plafond de la durée de vie d'un rayon pro rangé : **5 minutes** (Hugo,
 * 2026-11-04, `plan-rayon-jusqu-a-la-prochaine-heure.md` § 1 ; 30 s avant).
 *
 * Les opérations datées n'attendent pas le plafond : le rayon expire à leur
 * prochain instant ({@link recognisedShelfExpiry}). Le plafond, lui, borne
 * tout ce que le calcul NE CONNAÎT PAS (vérifié le 2026-11-04 par `vitruve`,
 * § 0) : une promotion ou un prix daté qui OUVRE (seul ce qui est en vigueur
 * est lu), une plage hebdomadaire d'offre, le plancher dynamique, et une purge
 * perdue (fenêtre de regroupement en mémoire, effacement en panne). C'est un
 * prix d'étiquette : la passation relit tout et refuse ce qui a changé.
 * Au-delà de 5 minutes : la phase 2 du plan d'abord.
 */
export const RECOGNISED_SHELF_LIFETIME_MS = 5 * 60_000;

/**
 * L'échéance d'un rayon calculé à `now` : le plafond, ou plus tôt le prochain
 * instant d'opération qui le change (`nextChangeAt`, déjà futur).
 */
export function recognisedShelfExpiry(now: Date, nextChangeAt: Date | null): Date {
  const ceiling = now.getTime() + RECOGNISED_SHELF_LIFETIME_MS;
  return new Date(nextChangeAt === null ? ceiling : Math.min(ceiling, nextChangeAt.getTime()));
}

/**
 * **Le rayon d'un client reconnu, passé par le magasin des rayons pro** (C2).
 *
 * L'ordre est la garantie, et il ne se permute pas :
 *
 * 1. relever la version AVANT de calculer (le raté la porte) ;
 * 2. calculer depuis la base, exactement comme sans cache ;
 * 3. ranger avec la version relevée — le magasin refuse si une purge est
 *    passée entre-temps, et le rayon peut-être ancien n'est pas gardé.
 *
 * La clé est la société que `@ActingCompany` a résolue EN BASE, jamais une
 * valeur du client : servir le rayon d'une société à une autre est la seule
 * erreur grave de ce cache (partie 1, « Ce qui rend une erreur sans
 * conséquence »). `null` (l'espace perso) a sa propre entrée.
 *
 * Magasin indisponible : le rayon calculé est servi, rien n'est rangé — le
 * comportement d'avant le cache (§ 4 bis).
 */
@Injectable()
export class RecognisedShelf {
  constructor(
    private readonly pricing: ShopCataloguePricing,
    private readonly cache: ResilientShopShelfCache,
    private readonly clock: Clock,
  ) {}

  async read(key: ShelfKey): Promise<ShopCatalogueView> {
    const now = this.clock.now();
    const lookup = await this.cache.read(key, now);
    if (lookup?.kind === "hit") {
      return lookup.view;
    }
    // En français : la route reconnue n'a pas de paramètre de langue
    // (`my-shop-catalogue.controller.ts`) — la clé n'en a donc pas besoin.
    const { view, principalId, nextChangeAt } = await this.pricing.shelf(
      key,
      "registered",
      CATALOG_SOURCE_LANGUAGE,
    );
    if (lookup !== null) {
      await this.cache.store({
        key,
        view,
        version: lookup.version,
        principalId,
        expiresAt: recognisedShelfExpiry(now, nextChangeAt),
      });
    }
    return view;
  }
}
