import type { ProductRecord } from "../../../catalogue/product/domain/ports/product.repository.js";
import type { CatalogueReader } from "../../../catalogue/shared/domain/ports/catalogue-reader.js";
import {
  sellsContext,
  type SalesChannels,
} from "../../../catalogue/shared/domain/value-objects/sales-channels.js";
import { ROOT_CONTEXT_KEY } from "../../../sales-contexts/domain/value-objects/bootstrap-contexts.js";
import type { B2bMembershipService } from "../membership/membership.service.js";

/**
 * **Ce que la bascule vers l'audience regarde** — lu une fois, partagé par
 * l'aperçu et par son application (lot 2b, 2b1), pour que la liste appliquée
 * soit, par construction, celle que l'aperçu a montrée.
 */
export interface AudienceSwitchScope {
  /** Les fiches en vente au référentiel (statut `published`). */
  readonly published: readonly ProductRecord[];
  /** Les fiches liées au canal B2B, archivées comprises. */
  readonly boundProducts: readonly ProductRecord[];
  readonly bound: ReadonlySet<string>;
  /** Les canaux effectifs des fiches en vente. */
  readonly channels: ReadonlyMap<string, SalesChannels>;
}

/**
 * Lit le périmètre. `byIds` et non `publishable` pour les fiches liées : une
 * fiche liée puis ARCHIVÉE est l'écart le plus net, et `publishable` écarte
 * les archivées.
 */
export async function readAudienceSwitchScope(
  catalogue: CatalogueReader,
  membership: Pick<B2bMembershipService, "publishedProductIds">,
): Promise<AudienceSwitchScope> {
  const [live, boundIds] = await Promise.all([
    catalogue.publishable(),
    membership.publishedProductIds(),
  ]);
  const published = live.filter((product) => product.status === "published");
  const [boundProducts, channels] = await Promise.all([
    catalogue.byIds(boundIds),
    catalogue.effectiveChannels(published),
  ]);
  return { published, boundProducts, bound: new Set(boundIds), channels };
}

/** Publiée, mais non liée au canal : invisible aux pros aujourd'hui. */
export function publishedUnbound(scope: AudienceSwitchScope): ProductRecord[] {
  return scope.published.filter((product) => !scope.bound.has(product.id));
}

/** Publiée, mais sa case `b2b` effective est fermée : invisible aux pros aujourd'hui. */
export function publishedB2bClosed(scope: AudienceSwitchScope): ProductRecord[] {
  return scope.published.filter((product) => !soldToPros(scope, product));
}

/** Publiée, liée et ouverte au `b2b` : ce qui se vend aux pros aujourd'hui. */
export function soldToday(scope: AudienceSwitchScope): ProductRecord[] {
  return scope.published.filter(
    (product) => scope.bound.has(product.id) && soldToPros(scope, product),
  );
}

/**
 * **Les fiches publiées mais invisibles aujourd'hui** (H7) — non liées, ou
 * case `b2b` fermée — sans doublon, par SKU. Ce sont celles que la bascule
 * désactive : après elle, une fiche active est vue par son audience, et ces
 * fiches-là n'étaient vues par personne.
 */
export function invisibleToday(scope: AudienceSwitchScope): ProductRecord[] {
  const byId = new Map(
    [...publishedUnbound(scope), ...publishedB2bClosed(scope)].map((product) => [
      product.id,
      product,
    ]),
  );
  return [...byId.values()].sort((left, right) => left.sku.localeCompare(right.sku));
}

function soldToPros(scope: AudienceSwitchScope, product: ProductRecord): boolean {
  return sellsContext(scope.channels.get(product.id) ?? [], ROOT_CONTEXT_KEY);
}
