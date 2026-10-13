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
import {
  type FrozenManifestLine,
  type HeldTransferItem,
  type InternalTransferState,
  type ItemContents,
  isLive,
  subjectOf,
  type TransferDetachment,
  type TransferItem,
  type TransferReceipt,
  type TransferState,
} from "./internal-transfer-state.js";
import { receiptOf } from "./transfer-receipt.js";

export {
  type FrozenManifestLine,
  type HeldTransferItem,
  type InternalTransferState,
  type ItemContents,
  isLive,
  subjectOf,
  type TransferDetachment,
  type TransferItem,
  type TransferReceipt,
  type TransferState,
} from "./internal-transfer-state.js";

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
 * - **reçu, il est clos** (lot T2) : une réception, une seule — remise au
 *   site après le départ, ou manuelle depuis `planned`, motif obligatoire ;
 *   un transfert reçu ne part plus (le départ l'ignore, B2 du §12.3) ;
 * - une commande se RETIRE tant qu'il est prévu ; parti ou reçu, rien ne
 *   bouge (le manifeste est figé, le transfert ne « ramène » rien).
 */
export class InternalTransfer {
  private items: HeldTransferItem[];
  private departed: Date | null;
  private receipt: TransferReceipt | null;
  private frozen: readonly FrozenManifestLine[];
  private currentVersion: number;
  private updatedAt: Date;

  private constructor(
    private readonly state: Omit<
      InternalTransferState,
      "items" | "departedAt" | "received" | "manifest" | "version" | "updatedAt"
    >,
    /** `null` : ouvert à l'instant, rien en base. */
    readonly loadedVersion: number | null,
    rest: Pick<InternalTransferState, "items" | "departedAt" | "manifest" | "updatedAt"> & {
      readonly received: TransferReceipt | null;
    },
  ) {
    this.items = [...rest.items];
    this.departed = rest.departedAt;
    this.receipt = rest.received;
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
      received: null,
      manifest: [],
      updatedAt: at,
    });
  }

  /** @throws {InternalTransferCorruptedError} un manifeste sans départ, ou un départ sans manifeste. */
  static restore(state: InternalTransferState): InternalTransfer {
    if (state.departedAt === null && state.manifest.length > 0) {
      throw new InternalTransferCorruptedError(state.id, "un manifeste figé sans départ");
    }
    const { items, departedAt, received, manifest, version, updatedAt, ...identity } = state;
    return new InternalTransfer(identity, version, {
      items,
      departedAt,
      received: received ?? null,
      manifest,
      updatedAt,
    });
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

  get received(): TransferReceipt | null {
    return this.receipt;
  }

  get status(): TransferState {
    if (this.receipt !== null) {
      return "received";
    }
    return this.departed === null ? "planned" : "departed";
  }

  /** Les éléments qu'il porte TOUJOURS — un élément retiré n'y est plus. */
  get heldItems(): readonly HeldTransferItem[] {
    return this.items.filter(isLive);
  }

  /** Les commandes qu'il porte, dans l'ordre d'ajout. */
  get orderIds(): readonly string[] {
    return this.heldItems.flatMap((item) => (item.kind === "order" ? [item.orderId] : []));
  }

  /**
   * Ajoute un élément — rend `false` s'il y est déjà (rien ne change).
   * @throws {InternalTransferMismatchError} un autre site ou un autre jour.
   * @throws {InternalTransferDepartedError} il est parti, ou déjà reçu.
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
    if (
      this.heldItems.some((held) => held.kind === input.item.kind && subjectOf(held) === subject)
    ) {
      return false;
    }
    if (this.status !== "planned") {
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
    // Reçu à la main avant le départ (B2 du §12.3) : l'arrêt part sans effet.
    if (this.status !== "planned") {
      return false;
    }
    this.frozen = this.heldItems.flatMap((item) =>
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
      this.heldItems.map((item): ManifestItem => ({
        itemId: item.id,
        kind: item.kind,
        subjectId: subjectOf(item),
        lines: linesOf(item),
      })),
    );
  }

  /**
   * **Reçu au site** (lot T2) : remis par le livreur après le départ, ou
   * réceptionné au comptoir — depuis `planned`, c'est une réception MANUELLE,
   * et son motif est obligatoire (sortie de S3, §6).
   *
   * @throws {TransferAlreadyReceivedError} une réception, une seule.
   * @throws {TransferReceptionReasonRequiredError} manuelle sans motif.
   */
  receive(input: { readonly at: Date; readonly by: string; readonly reason: string | null }): void {
    this.receipt = receiptOf(this.status, this.state.siteLabel, input);
    this.touch(input.at);
  }

  /**
   * **Retire une commande** (lot T2, décision 4 de Hugo) — annulée, changée
   * de jour ou de site. Prévu : elle sort (`detached`). Parti ou reçu : rien
   * ne bouge, le manifeste figé fait foi (`frozen`) ; l'appelant le dit au
   * journal. Absente : `absent`.
   */
  detachOrder(orderId: string, at: Date): TransferDetachment {
    const held = this.heldItems.find((item) => item.kind === "order" && item.orderId === orderId);
    if (held === undefined) {
      return "absent";
    }
    if (this.status !== "planned") {
      return "frozen";
    }
    this.items = this.items.map((item) =>
      item.id === held.id ? { ...item, detachedAt: at } : item,
    );
    this.touch(at);
    return "detached";
  }

  toSnapshot(): InternalTransferState {
    return {
      ...this.state,
      items: [...this.items],
      departedAt: this.departed,
      received: this.receipt,
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
