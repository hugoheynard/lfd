import {
  PlatformHasNoEquipmentError,
  PointOfSaleLabelRequiredError,
} from "../errors/points-of-sale-errors.js";
import type { PointOfSaleKind } from "../value-objects/point-of-sale.js";
import { syncTables, type TableState } from "../value-objects/table.js";

/** L'état complet d'un point de vente — ce que la persistance rend et reprend. */
export interface PointOfSaleSnapshot {
  readonly id: string;
  readonly kind: PointOfSaleKind;
  readonly label: string;
  /** Boutique seulement — `null` pour une plateforme, et la base le tient. */
  readonly baseUrl: string | null;
  /** Ce qu'il OFFRE, par clé de contexte. Distinct de ce qu'on y vend. */
  readonly contexts: readonly string[];
  readonly tables: readonly TableState[];
}

/** Ce qu'il faut pour ouvrir une BOUTIQUE. Le reste, l'agrégat le décide. */
export interface NewShopInput {
  readonly id: string;
  readonly label: string;
  readonly baseUrl: string;
  readonly contexts: readonly string[];
  readonly tableCount: number;
}

/**
 * Un **point de vente** — d'où l'on vend : ce qu'il offre, et son équipement.
 *
 * ## Ce qui a changé en devenant celui-ci
 *
 * C'était `Location`, un emplacement avec deux drapeaux — `clickCollect` et
 * `eatIn` — et un invariant : **fermer la salle vidait la grille de tables**.
 *
 * Les deux drapeaux sont devenus ce qu'ils étaient : des contextes OFFERTS,
 * lignes d'une table. En ajouter un troisième ne demande plus de colonne.
 *
 * Et l'invariant est tombé, délibérément. `eatIn` faisait deux métiers — « ce
 * lieu sert en salle » et « ce lieu a une grille de QR » — d'où la
 * destruction en cascade. Une grille de tables est de l'**équipement** : deux
 * boulangeries peuvent toutes deux servir en salle et une seule être équipée de
 * QR, ce que le modèle précédent ne savait pas dire. Retirer l'offre « sur
 * place » n'efface donc plus les QR ; la matrice a déjà cessé d'y vendre, donc
 * un code imprimé mène à une commande vide plutôt qu'à un mensonge. Détruire du
 * papier collé sur un meuble pour une case décochée était disproportionné.
 *
 * ## Ce que le genre interdit
 *
 * Une **plateforme** n'a ni URL de click & collect ni tables. La base porte la
 * même règle (`point_of_sale_shop_has_base_url`) ; l'agrégat refuse plutôt que
 * de laisser la contrainte parler en langage Postgres.
 */
export class PointOfSale {
  /**
   * La grille a-t-elle bougé depuis la lecture ?
   *
   * Elle porte les **jetons de QR** — l'accès à la commande à table. La
   * persistance la remplaçait à chaque enregistrement : renommer un point de
   * vente effaçait puis recréait ses 200 lignes, jetons compris. Ça marche tant
   * que `syncTables` les reporte, donc la survie d'un secret imprimé reposait
   * sur une recopie en mémoire, refaite pour rien.
   */
  private tablesChangedValue: boolean;

  private constructor(
    private readonly identity: string,
    private readonly kindValue: PointOfSaleKind,
    private labelValue: string,
    private baseUrlValue: string | null,
    private contextsValue: readonly string[],
    private tablesValue: readonly TableState[],
    tablesChanged: boolean,
  ) {
    this.tablesChangedValue = tablesChanged;
  }

  /** Ouvre une BOUTIQUE. Une plateforme ne s'ouvre pas : elle est semée au boot. */
  static openShop(input: NewShopInput): PointOfSale {
    return new PointOfSale(
      input.id,
      "shop",
      requireLabel(input.label),
      input.baseUrl.trim(),
      normalizeContexts(input.contexts),
      syncTables([], input.tableCount),
      true,
    );
  }

  static reconstitute(snapshot: PointOfSaleSnapshot): PointOfSale {
    return new PointOfSale(
      snapshot.id,
      snapshot.kind,
      snapshot.label,
      snapshot.baseUrl,
      snapshot.contexts,
      snapshot.tables,
      false,
    );
  }

  get id(): string {
    return this.identity;
  }

  get label(): string {
    return this.labelValue;
  }

  get isPlatform(): boolean {
    return this.kindValue === "platform";
  }

  /** Vrai si la persistance doit réécrire la grille. Voir `tablesChangedValue`. */
  get tablesChanged(): boolean {
    return this.tablesChangedValue;
  }

  rename(label: string): void {
    this.labelValue = requireLabel(label);
  }

  setBaseUrl(baseUrl: string): void {
    this.refusePlatform("d'URL de click & collect");
    this.baseUrlValue = baseUrl.trim();
  }

  /**
   * Règle ce que ce point de vente OFFRE.
   *
   * Il ne touche PAS à la grille de tables — c'est la différence avec
   * `setEatIn`, qui la vidait. Voir la note de classe.
   */
  setOfferedContexts(contexts: readonly string[]): void {
    this.contextsValue = normalizeContexts(contexts);
  }

  /**
   * Aligne la grille sur `count`, en **préservant** l'état QR des tables
   * conservées — leur numéro est l'identité de l'URL imprimée.
   */
  setTableCount(count: number): void {
    this.refusePlatform("de tables");
    const next = syncTables(this.tablesValue, count);
    if (next.length !== this.tablesValue.length) {
      this.tablesValue = next;
      this.tablesChangedValue = true;
    }
  }

  /**
   * (Re)génère le QR d'une table : le token neuf **invalide** tout QR déjà
   * imprimé pour elle.
   *
   * @returns `false` si la table n'existe pas — l'appelant décide du refus, le
   *   domaine ne connaît pas les codes HTTP.
   */
  attachQr(tableNumber: number, token: string): boolean {
    return this.rewriteTable(tableNumber, { qrCreated: true, token });
  }

  /** Retire le QR d'une table ; le code imprimé cesse d'ouvrir quoi que ce soit. */
  detachQr(tableNumber: number): boolean {
    return this.rewriteTable(tableNumber, { qrCreated: false, token: null });
  }

  snapshot(): PointOfSaleSnapshot {
    return {
      id: this.identity,
      kind: this.kindValue,
      label: this.labelValue,
      baseUrl: this.baseUrlValue,
      contexts: this.contextsValue,
      tables: this.tablesValue,
    };
  }

  private refusePlatform(what: string): void {
    if (this.isPlatform) {
      throw new PlatformHasNoEquipmentError(what);
    }
  }

  private rewriteTable(tableNumber: number, patch: Omit<TableState, "number">): boolean {
    const target = this.tablesValue.find((table) => table.number === tableNumber);
    if (target === undefined) {
      return false;
    }
    this.tablesValue = this.tablesValue.map((table) =>
      table.number === tableNumber ? { number: table.number, ...patch } : table,
    );
    this.tablesChangedValue = true;
    return true;
  }
}

function requireLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed === "") {
    throw new PointOfSaleLabelRequiredError();
  }
  return trimmed;
}

/**
 * Dédoublonne et **ordonne** l'offre.
 *
 * L'ordre n'a pas de sens métier ; il en a pour la COMPARAISON. Le journal
 * inscrit un avant/après, et deux offres identiques rangées différemment
 * produiraient un « changement » que personne n'a fait.
 */
function normalizeContexts(contexts: readonly string[]): readonly string[] {
  return [...new Set(contexts)].sort((a, b) => a.localeCompare(b));
}
