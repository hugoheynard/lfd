import { DepartureSiteReader } from "../../../../delivery/channels/commerce/index.js";
import { PickupDiscount } from "../../../pickup-addresses/domain/pickup-discount.js";
import { Site, type SitePlace, type SiteState } from "../../domain/site.js";
import { SiteRepository } from "../../domain/site.repository.js";
import { SiteTables, type SiteTablesState } from "../../domain/site-tables.js";
import { SiteTablesRepository } from "../../domain/site-tables.repository.js";

/** Un lieu valide, sans remise. */
export const PLACE: SitePlace = {
  label: "Laboratoire",
  ligne1: "18 rue des Archives",
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "France",
  opening: { publicOpening: null, proPickup: null },
  gps: null,
  discount: PickupDiscount.of({ b2b: null, b2c: null }),
};

/** Un site enregistré, tel que l'adaptateur le relirait. */
export function storedSite(id: string, overrides: Partial<Omit<SiteState, "id">> = {}): Site {
  const fresh = Site.declare(id, PLACE).snapshot();
  return Site.rehydrate({ ...fresh, ...overrides });
}

/**
 * **Les sites en mémoire** — un double du port d'écriture, qui garde l'ordre
 * des `save` pour qu'un test lise ce qui a été écrit, et dans quel ordre.
 * Chaque `load` rend une COPIE : une mutation non sauvée ne fuit pas.
 */
export class InMemorySites extends SiteRepository {
  readonly saved: string[] = [];
  private readonly rows = new Map<string, SiteState>();

  constructor(...sites: readonly Site[]) {
    super();
    for (const site of sites) {
      this.rows.set(site.id, site.snapshot());
    }
  }

  load(id: string): Promise<Site | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row === undefined ? null : Site.rehydrate(row));
  }

  save(site: Site): Promise<void> {
    this.rows.set(site.id, site.snapshot());
    this.saved.push(site.id);
    return Promise.resolve();
  }

  /** L'état enregistré d'un site — pour les assertions. */
  stateOf(id: string): SiteState | undefined {
    return this.rows.get(id);
  }
}

/**
 * **Le départ des tournées, figé** — un double du port que la livraison
 * déclare et implémente. Il compte ses lectures : le handler ne doit la
 * demander que lorsque « Livraison » est retirée.
 */
export class FixedDepartureSite extends DepartureSiteReader {
  reads = 0;

  constructor(private readonly siteId: string | null = null) {
    super();
  }

  currentSiteId(): Promise<string | null> {
    this.reads += 1;
    return Promise.resolve(this.siteId);
  }
}

/**
 * **Les grilles de tables en mémoire** — un double du port d'écriture. Chaque
 * `load` rend une COPIE ; une grille jamais enregistrée se lit vide, comme en base.
 */
export class InMemorySiteTables extends SiteTablesRepository {
  readonly saved: string[] = [];
  private readonly rows = new Map<string, SiteTablesState>();

  constructor(...grids: readonly SiteTables[]) {
    super();
    for (const grid of grids) {
      this.rows.set(grid.siteId, grid.snapshot());
    }
  }

  load(siteId: string): Promise<SiteTables> {
    const row = this.rows.get(siteId);
    return Promise.resolve(
      row === undefined ? SiteTables.empty(siteId) : SiteTables.rehydrate(row),
    );
  }

  save(tables: SiteTables): Promise<void> {
    this.rows.set(tables.siteId, tables.snapshot());
    this.saved.push(tables.siteId);
    return Promise.resolve();
  }

  /** La grille enregistrée d'un site — pour les assertions. */
  stateOf(siteId: string): SiteTablesState | undefined {
    return this.rows.get(siteId);
  }
}
