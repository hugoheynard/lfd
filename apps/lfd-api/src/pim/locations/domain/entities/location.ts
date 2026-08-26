import { LocationNameRequiredError } from "../errors/locations-errors.js";
import { syncTables, type TableState } from "../value-objects/table.js";

/**
 * ⚠️ `eatIn`, alors que la grille de canaux d'une famille garde `surPlace` — et
 * ce n'est pas une incohérence oubliée. Ici c'est un **identifiant** : la
 * colonne reste `sur_place` grâce au `@map`, donc le renommage n'a coûté
 * aucune migration (même geste que `tvaIntracom` → `vatNumber` au palier 3).
 * Là-bas c'est une **clé de donnée**, écrite dans le `jsonb` de
 * `channel_preset` et dans `sales_context.key` : la renommer est une migration
 * de données, et le plan de langue la diffère parce que C0-d supprime ces deux
 * clés au lieu de les traduire (`documentation/langue-du-code.md` § 4 quater).
 */

/** L'état complet d'un emplacement — ce que la persistance rend et reprend. */
export interface LocationSnapshot {
  readonly id: string;
  readonly name: string;
  readonly clickCollect: boolean;
  readonly eatIn: boolean;
  readonly baseUrl: string;
  readonly tables: readonly TableState[];
}

/** Ce qu'il faut pour ouvrir un emplacement. Le reste, l'agrégat le décide. */
export interface NewLocationInput {
  readonly id: string;
  readonly name: string;
  readonly clickCollect: boolean;
  readonly eatIn: boolean;
  readonly baseUrl: string;
  readonly tableCount: number;
}

/**
 * Un **emplacement** — un point de vente, ses modes, et sa grille de tables.
 *
 * ## Pourquoi c'est devenu un agrégat
 *
 * Ça n'en était pas un : un port anémique (`updateFields`, `replaceTables`,
 * `setTableQr` — une méthode par mutation) et des invariants qui vivaient dans
 * les handlers. Deux d'entre eux étaient donc **cassables**.
 *
 * D'abord parce que régler un emplacement faisait **deux écritures** : les
 * champs, puis les tables. Entre les deux, ou si la seconde échouait, un
 * emplacement restait « pas sur place » AVEC des tables — exactement l'état que
 * le handler s'efforçait d'empêcher. Ici l'invariant est tenu par le
 * constructeur : il n'y a pas de chemin qui le viole, et la persistance écrit
 * un seul état.
 *
 * Ensuite parce que « couper sur place vide les tables » se lisait dans un
 * `if` du handler de mise à jour, donc nulle part pour qui lit le domaine.
 *
 * ## L'invariant, en une phrase
 *
 * **Sans « sur place », pas de tables.** Une table n'existe que pour être
 * occupée ; en garder une sur un emplacement qui ne sert plus en salle laisse
 * un QR imprimé qui mène quelque part.
 */
export class Location {
  /**
   * La grille a-t-elle bougé depuis la lecture ?
   *
   * Elle porte les **jetons de QR** — l'accès à la commande à table. La
   * persistance la remplaçait à chaque enregistrement : renommer un emplacement
   * effaçait puis recréait ses 200 lignes, jetons compris. Ça marche tant que
   * `syncTables` les reporte correctement, donc la survie d'un secret imprimé
   * reposait sur une recopie en mémoire, refaite pour rien.
   *
   * Faux à la reconstitution, vrai à l'ouverture (tout est à écrire), et vrai
   * dès qu'un geste touche VRAIMENT la grille — un `setTableCount` sans salle
   * ou un QR sur une table absente ne changent rien, donc ne marquent rien.
   */
  private tablesChangedValue: boolean;

  private constructor(
    private readonly identity: string,
    private nameValue: string,
    private clickCollectValue: boolean,
    private eatInValue: boolean,
    private baseUrlValue: string,
    private tablesValue: readonly TableState[],
    tablesChanged: boolean,
  ) {
    this.tablesChangedValue = tablesChanged;
  }

  static open(input: NewLocationInput): Location {
    return new Location(
      input.id,
      requireName(input.name),
      input.clickCollect,
      input.eatIn,
      input.baseUrl.trim(),
      input.eatIn ? syncTables([], input.tableCount) : [],
      true,
    );
  }

  static reconstitute(snapshot: LocationSnapshot): Location {
    return new Location(
      snapshot.id,
      snapshot.name,
      snapshot.clickCollect,
      snapshot.eatIn,
      snapshot.baseUrl,
      snapshot.tables,
      false,
    );
  }

  get id(): string {
    return this.identity;
  }

  get name(): string {
    return this.nameValue;
  }

  get eatIn(): boolean {
    return this.eatInValue;
  }

  get tables(): readonly TableState[] {
    return this.tablesValue;
  }

  /** Vrai si la persistance doit réécrire la grille. Voir `tablesChangedValue`. */
  get tablesChanged(): boolean {
    return this.tablesChangedValue;
  }

  rename(name: string): void {
    this.nameValue = requireName(name);
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrlValue = baseUrl.trim();
  }

  setClickCollect(open: boolean): void {
    this.clickCollectValue = open;
  }

  /**
   * Ouvre ou ferme la salle. **Fermer vide la grille** : c'est l'invariant, et
   * il est ici plutôt que dans un handler pour qu'aucun autre chemin ne puisse
   * l'oublier.
   */
  setEatIn(open: boolean): void {
    this.eatInValue = open;
    if (!open && this.tablesValue.length > 0) {
      this.tablesValue = [];
      this.tablesChangedValue = true;
    }
  }

  /**
   * Aligne la grille sur `count`, en **préservant** l'état QR des tables
   * conservées — leur numéro est l'identité de l'URL imprimée. Sans salle, il
   * n'y a rien à aligner.
   */
  setTableCount(count: number): void {
    if (!this.eatInValue) {
      return;
    }
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

  snapshot(): LocationSnapshot {
    return {
      id: this.identity,
      name: this.nameValue,
      clickCollect: this.clickCollectValue,
      eatIn: this.eatInValue,
      baseUrl: this.baseUrlValue,
      tables: this.tablesValue,
    };
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

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new LocationNameRequiredError();
  }
  return trimmed;
}
