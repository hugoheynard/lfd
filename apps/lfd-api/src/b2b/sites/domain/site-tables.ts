import type { Site } from "./site.js";
import {
  ArchivedSiteError,
  SiteTableCountError,
  SiteTableNotFoundError,
  SiteTablesWithoutEatInError,
} from "./site-errors.js";

/** Le plus de tables qu'une salle porte — la borne de l'ancienne grille du référentiel. */
export const MAX_SITE_TABLES = 200;

/** Une table : son numéro, et son QR s'il en a un. */
export interface SiteTableState {
  readonly number: number;
  /** Le secret du QR, unique en base ; `null` = aucun QR. */
  readonly token: string | null;
  /** Quand le QR actuel a été généré ; `null` sans QR. */
  readonly qrCreatedAt: Date | null;
}

/** Tout l'état d'une grille — la forme lue et écrite par l'adaptateur. */
export interface SiteTablesState {
  readonly siteId: string;
  /** Numérotées de 1 à N, dans l'ordre. */
  readonly tables: readonly SiteTableState[];
}

/**
 * **La grille de tables d'un site** (Hugo, 2026-10-17, plan
 * `documentation/sites/sites.md` §6 bis).
 *
 * Un agrégat À PART de `Site` : jusqu'à {@link MAX_SITE_TABLES} lignes, qu'aucune
 * lecture du site (checkout compris) n'a à relire. Il garde ses invariants —
 * des tables numérotées de 1 à N, un QR seulement sur une table qui existe —
 * et lit chez le `Site` ce qui ne lui appartient pas : la salle et l'archivage.
 *
 * Le numéro d'une table est son identité imprimée : changer le nombre de
 * tables ajoute ou retire EN FIN de grille, et garde le QR des autres.
 */
export class SiteTables {
  private constructor(private state: SiteTablesState) {}

  /** Une grille vide — un site qui n'a jamais eu de tables. */
  static empty(siteId: string): SiteTables {
    return new SiteTables({ siteId, tables: [] });
  }

  /** Relit une grille enregistrée. */
  static rehydrate(state: SiteTablesState): SiteTables {
    return new SiteTables(state);
  }

  get siteId(): string {
    return this.state.siteId;
  }

  get count(): number {
    return this.state.tables.length;
  }

  /** L'état à écrire — lu par l'adaptateur. */
  snapshot(): SiteTablesState {
    return this.state;
  }

  /**
   * Aligne la grille sur `count` tables : en ajoute ou en retire à la fin.
   * Une table retirée perd son QR.
   *
   * @throws {SiteTableCountError} `count` n'est pas un entier entre 0 et 200.
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteTablesWithoutEatInError} des tables sur un site sans « Sur place ».
   */
  setCount(count: number, site: Site): void {
    if (!Number.isInteger(count) || count < 0 || count > MAX_SITE_TABLES) {
      throw new SiteTableCountError(count, MAX_SITE_TABLES);
    }
    assertActive(site);
    if (count > 0 && !site.eatIn) {
      throw new SiteTablesWithoutEatInError(site.label);
    }
    const kept = this.state.tables.slice(0, count);
    const added = Array.from({ length: count - kept.length }, (_, index) => ({
      number: kept.length + index + 1,
      token: null,
      qrCreatedAt: null,
    }));
    this.state = { ...this.state, tables: [...kept, ...added] };
  }

  /**
   * (Re)génère le QR d'une table : le jeton neuf invalide le code déjà imprimé.
   *
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteTableNotFoundError} la table n'existe pas.
   */
  attachQr(tableNumber: number, token: string, at: Date, site: Site): void {
    this.rewrite(tableNumber, site, { token, qrCreatedAt: at });
  }

  /**
   * Retire le QR d'une table : le code imprimé cesse de valoir.
   *
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteTableNotFoundError} la table n'existe pas.
   */
  detachQr(tableNumber: number, site: Site): void {
    this.rewrite(tableNumber, site, { token: null, qrCreatedAt: null });
  }

  private rewrite(tableNumber: number, site: Site, qr: Omit<SiteTableState, "number">): void {
    assertActive(site);
    if (!this.state.tables.some((table) => table.number === tableNumber)) {
      throw new SiteTableNotFoundError(site.label, tableNumber);
    }
    const tables = this.state.tables.map((table) =>
      table.number === tableNumber ? { number: table.number, ...qr } : table,
    );
    this.state = { ...this.state, tables };
  }
}

function assertActive(site: Site): void {
  if (site.isArchived) {
    throw new ArchivedSiteError(site.label);
  }
}
