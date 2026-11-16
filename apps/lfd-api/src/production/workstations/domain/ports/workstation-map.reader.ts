/** Un poste en service, tel que la page le lit. */
export interface ListedWorkstation {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}

/** Les postes en service et le poste de chaque produit placé. */
export interface WorkstationListing {
  /** Dans l'ordre des fiches. */
  readonly workstations: readonly ListedWorkstation[];
  /** Référence produit → id du poste. */
  readonly placements: ReadonlyMap<string, string>;
}

/**
 * Port de **lecture** de la carte des postes, pour la page Postes : il ne
 * charge pas l'agrégat, ne verrouille rien, et ne rend que les postes en
 * service (ISP — un lecteur n'a que faire des archivés ni du verrou).
 */
export abstract class WorkstationMapReader {
  abstract listing(): Promise<WorkstationListing>;
}
