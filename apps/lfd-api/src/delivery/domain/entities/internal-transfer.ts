import { InvalidServiceDayError } from "../errors/delivery-round-errors.js";
import {
  InternalTransferCorruptedError,
  InternalTransferDepartedError,
  InternalTransferMismatchError,
} from "../errors/internal-transfer-errors.js";
import {
  type ManifestItem,
  type ManifestLine,
  manifestOf,
  type TransferManifest,
} from "../services/transfer-manifest.js";
import { isCalendarDay } from "../value-objects/service-day.js";

/**
 * Un **élément** d'un transfert (décision de Hugo du 2026-10-13) : une
 * commande en retrait au site, ou un réassort de la boutique du site — ce
 * second genre est déclaré, pas bâti : aucun écrivain ne le produit.
 */
export type TransferItem =
  | { readonly kind: "order"; readonly orderId: string }
  | { readonly kind: "refill"; readonly refillId: string };

/** Un élément tel que le transfert le range : son identifiant, son ajout. */
export type HeldTransferItem = TransferItem & {
  readonly id: string;
  readonly attachedAt: Date;
};

/** Une ligne du manifeste figé : l'élément qui la porte, et son contenu. */
export interface FrozenManifestLine extends ManifestLine {
  readonly itemId: string;
}

/** L'état persisté d'un transfert — ce que `restore` réhydrate et `toSnapshot` rend. */
export interface InternalTransferState {
  readonly id: string;
  readonly serviceDay: string;
  readonly siteId: string;
  /** Le nom du site, FIGÉ à l'ouverture. */
  readonly siteLabel: string;
  readonly items: readonly HeldTransferItem[];
  readonly departedAt: Date | null;
  /** Le manifeste figé au départ ; vide tant qu'il n'est pas parti. */
  readonly manifest: readonly FrozenManifestLine[];
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Le contenu d'un élément, lu au moment du départ ; `undefined` : inconnu. */
export type ItemContents = (item: HeldTransferItem) => readonly ManifestLine[] | undefined;

/** L'identifiant opaque de ce que l'élément porte. */
export function subjectOf(item: TransferItem): string {
  return item.kind === "order" ? item.orderId : item.refillId;
}

/**
 * **Un transfert interne** (plan du transfert interne, §3, lot T1) : pour un
 * site servi par transfert et un jour, un lot d'éléments qui part du site de
 * départ des tournées, porté par UN arrêt de genre `transfer`.
 *
 * Invariants tenus ici :
 * - il ne porte que des éléments de SON site et de SON jour ;
 * - un élément n'y est qu'une fois (et dans un seul transfert : la base) ;
 * - **parti, il ne reçoit plus rien** — l'appelant en ouvre un autre (Q-T3) ;
 * - il part une fois ; son manifeste se FIGE au départ, et fait foi ensuite
 *   (« on doit savoir ce qu'on transporte », Hugo, 2026-10-13).
 *
 * La réception (`received`, §3) est le lot T2.
 */
export class InternalTransfer {
  private items: HeldTransferItem[];
  private departed: Date | null;
  private frozen: readonly FrozenManifestLine[];
  private currentVersion: number;
  private updatedAt: Date;

  private constructor(
    private readonly state: Omit<
      InternalTransferState,
      "items" | "departedAt" | "manifest" | "version" | "updatedAt"
    >,
    /** `null` : ouvert à l'instant, rien en base. */
    readonly loadedVersion: number | null,
    rest: Pick<InternalTransferState, "items" | "departedAt" | "manifest" | "updatedAt">,
  ) {
    this.items = [...rest.items];
    this.departed = rest.departedAt;
    this.frozen = rest.manifest;
    this.currentVersion = loadedVersion ?? 1;
    this.updatedAt = rest.updatedAt;
  }

  /**
   * Ouvre un transfert prévu, vide.
   * @throws {InvalidServiceDayError}
   */
  static plan(input: {
    readonly id: string;
    readonly serviceDay: string;
    readonly siteId: string;
    readonly siteLabel: string;
    readonly at: Date;
  }): InternalTransfer {
    if (!isCalendarDay(input.serviceDay)) {
      throw new InvalidServiceDayError(input.serviceDay);
    }
    const { at, ...identity } = input;
    return new InternalTransfer({ ...identity, createdAt: at }, null, {
      items: [],
      departedAt: null,
      manifest: [],
      updatedAt: at,
    });
  }

  /** @throws {InternalTransferCorruptedError} un manifeste sans départ, ou un départ sans manifeste. */
  static restore(state: InternalTransferState): InternalTransfer {
    if (state.departedAt === null && state.manifest.length > 0) {
      throw new InternalTransferCorruptedError(state.id, "un manifeste figé sans départ");
    }
    const { items, departedAt, manifest, version, updatedAt, ...identity } = state;
    return new InternalTransfer(identity, version, { items, departedAt, manifest, updatedAt });
  }

  get id(): string {
    return this.state.id;
  }

  get serviceDay(): string {
    return this.state.serviceDay;
  }

  get siteId(): string {
    return this.state.siteId;
  }

  get siteLabel(): string {
    return this.state.siteLabel;
  }

  get departedAt(): Date | null {
    return this.departed;
  }

  get heldItems(): readonly HeldTransferItem[] {
    return [...this.items];
  }

  /** Les commandes qu'il porte, dans l'ordre d'ajout. */
  get orderIds(): readonly string[] {
    return this.items.flatMap((item) => (item.kind === "order" ? [item.orderId] : []));
  }

  /**
   * Ajoute un élément — rend `false` s'il y est déjà (rien ne change).
   * @throws {InternalTransferMismatchError} un autre site ou un autre jour.
   * @throws {InternalTransferDepartedError} il est parti.
   */
  attach(
    input: { readonly itemId: string; readonly item: TransferItem },
    target: { readonly siteId: string; readonly serviceDay: string },
    at: Date,
  ): boolean {
    if (target.siteId !== this.state.siteId || target.serviceDay !== this.state.serviceDay) {
      throw new InternalTransferMismatchError(this.state.siteLabel, this.state.serviceDay);
    }
    const subject = subjectOf(input.item);
    if (this.items.some((held) => held.kind === input.item.kind && subjectOf(held) === subject)) {
      return false;
    }
    if (this.departed !== null) {
      throw new InternalTransferDepartedError(this.state.siteLabel, this.state.serviceDay);
    }
    this.items = [...this.items, { ...input.item, id: input.itemId, attachedAt: at }];
    this.touch(at);
    return true;
  }

  /**
   * **Part** avec la tournée qui porte son arrêt, et fige son manifeste. Rend
   * `false` s'il était déjà parti : le premier départ fait foi, un second ne
   * réécrit rien. Un élément dont le contenu est inconnu part avec un contenu
   * vide — le manifeste ne l'invente pas, et la réception (T2) le verra.
   */
  depart(at: Date, contents: ItemContents): boolean {
    if (this.departed !== null) {
      return false;
    }
    this.frozen = this.items.flatMap((item) =>
      (contents(item) ?? []).map((line) => ({ ...line, itemId: item.id })),
    );
    this.departed = at;
    this.touch(at);
    return true;
  }

  /**
   * Le manifeste : FIGÉ s'il est parti, sinon calculé depuis `contents`, le
   * contenu lu à l'instant.
   */
  manifest(contents: ItemContents): TransferManifest {
    const linesOf = (item: HeldTransferItem): readonly ManifestLine[] =>
      this.departed === null
        ? (contents(item) ?? [])
        : this.frozen
            .filter((line) => line.itemId === item.id)
            .map(({ sku, productName, quantity }) => ({ sku, productName, quantity }));
    return manifestOf(
      this.items.map((item): ManifestItem => ({
        itemId: item.id,
        kind: item.kind,
        subjectId: subjectOf(item),
        lines: linesOf(item),
      })),
    );
  }

  toSnapshot(): InternalTransferState {
    return {
      ...this.state,
      items: [...this.items],
      departedAt: this.departed,
      manifest: [...this.frozen],
      version: this.currentVersion,
      updatedAt: this.updatedAt,
    };
  }

  private touch(at: Date): void {
    if (this.loadedVersion !== null && this.currentVersion === this.loadedVersion) {
      this.currentVersion = this.loadedVersion + 1;
    }
    this.updatedAt = at;
  }
}
