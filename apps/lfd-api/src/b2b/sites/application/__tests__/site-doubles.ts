import { PickupDiscount } from "../../../pickup-addresses/domain/pickup-discount.js";
import { Site, type SitePlace, type SiteState } from "../../domain/site.js";
import { SiteRepository } from "../../domain/site.repository.js";

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
  discount: PickupDiscount.of(null, { b2b: true, b2c: true }),
};

/** Un site enregistré, tel que l'adaptateur le relirait. */
export function storedSite(id: string, overrides: Partial<Omit<SiteState, "id">> = {}): Site {
  const fresh = Site.declare(id, PLACE, false).snapshot();
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

  loadDefault(): Promise<Site | null> {
    const row = [...this.rows.values()].find(
      (state) => state.isDefault && state.archivedAt === null,
    );
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
