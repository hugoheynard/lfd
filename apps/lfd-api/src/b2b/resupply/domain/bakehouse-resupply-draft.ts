import {
  BakehouseResupplyDraftChangedMeanwhileError,
  BakehouseResupplyDraftClosedError,
  BakehouseResupplyDraftKeyTakenError,
  BakehouseResupplyDraftSiteFrozenError,
  UnknownBakehouseResupplyDraftStatusError,
} from "./bakehouse-resupply-draft-errors.js";
import {
  type BakehouseResupplyDraftContent,
  draftContentOf,
} from "./bakehouse-resupply-draft-content.js";
import type { ResupplyTrace } from "./resupply-trace.js";

export {
  BAKEHOUSE_DRAFT_MAX_LINES,
  type BakehouseResupplyDraftContent,
  type BakehouseResupplyDraftLine,
} from "./bakehouse-resupply-draft-content.js";

/** `open` → `sent` | `discarded`, dans ce sens seulement. */
export type BakehouseResupplyDraftStatus = "open" | "sent" | "discarded";

const STATUSES: readonly BakehouseResupplyDraftStatus[] = ["open", "sent", "discarded"];

/** Le statut relu d'une valeur stockée, refusé si inconnu. */
export function bakehouseDraftStatusOf(value: string): BakehouseResupplyDraftStatus {
  const status = STATUSES.find((known) => known === value);
  if (status === undefined) {
    throw new UnknownBakehouseResupplyDraftStatusError(value);
  }
  return status;
}

/** L'état persisté d'un brouillon. */
export interface BakehouseResupplyDraftSnapshot {
  readonly id: string;
  /** La version écrite ; 0 pour un brouillon pas encore écrit. */
  readonly version: number;
  readonly status: BakehouseResupplyDraftStatus;
  readonly content: BakehouseResupplyDraftContent;
  readonly created: ResupplyTrace;
  /** Le dernier enregistrement (la création comprise). */
  readonly updated: ResupplyTrace;
  /** L'envoi ou la suppression ; `null` tant qu'il est ouvert. */
  readonly closed: ResupplyTrace | null;
  /** Le réassort né de l'envoi ; `null` hors `sent`. */
  readonly sentResupplyId: string | null;
}

/**
 * **Le brouillon d'un réassort du fournil** (plan
 * `documentation/reassort-boutiques/commander.md`, Hugo
 * 2026-10-28) — une composition gardée au serveur, À PART de la demande en
 * cours du comptoir et des réassorts envoyés : il n'a pas de journée, et ne
 * devient un réassort qu'à l'envoi, par le chemin de l'envoi du fournil.
 *
 * Ce qu'il garantit : un contenu valide ({@link draftContentOf}), une
 * écriture seulement tant qu'il est ouvert, sous la version LUE — deux postes
 * qui reprennent le même brouillon ne s'écrasent pas —, et
 * `open` → `sent` | `discarded`, jamais en arrière. Son point est figé à
 * l'ouverture (D3). Jamais supprimé.
 */
export class BakehouseResupplyDraft {
  private constructor(
    readonly id: string,
    /**
     * La version LUE en base (`0` : pas encore écrite). Elle n'avance pas en
     * mémoire : l'adaptateur écrit `version + 1` sous ce verrou, et un agrégat
     * ne se sauve qu'une fois par unité de travail — un second `save` sur la
     * même instance buterait sur son propre verrou (choix du 2026-11-02).
     */
    readonly version: number,
    private currentStatus: BakehouseResupplyDraftStatus,
    private currentContent: BakehouseResupplyDraftContent,
    readonly created: ResupplyTrace,
    private updatedTrace: ResupplyTrace,
    private closedTrace: ResupplyTrace | null,
    private resupplyId: string | null,
  ) {}

  /** « Enregistrer comme brouillon », la première fois. */
  static open(input: {
    readonly id: string;
    readonly content: BakehouseResupplyDraftContent;
    readonly trace: ResupplyTrace;
  }): BakehouseResupplyDraft {
    const content = draftContentOf(input.content);
    return new BakehouseResupplyDraft(
      input.id,
      0,
      "open",
      content,
      input.trace,
      input.trace,
      null,
      null,
    );
  }

  /** Réhydrate un brouillon relu ; son contenu revalide. */
  static restore(snapshot: BakehouseResupplyDraftSnapshot): BakehouseResupplyDraft {
    return new BakehouseResupplyDraft(
      snapshot.id,
      snapshot.version,
      snapshot.status,
      draftContentOf(snapshot.content),
      snapshot.created,
      snapshot.updated,
      snapshot.closed,
      snapshot.sentResupplyId,
    );
  }

  get status(): BakehouseResupplyDraftStatus {
    return this.currentStatus;
  }

  get content(): BakehouseResupplyDraftContent {
    return this.currentContent;
  }

  get updated(): ResupplyTrace {
    return this.updatedTrace;
  }

  get closed(): ResupplyTrace | null {
    return this.closedTrace;
  }

  get sentResupplyId(): string | null {
    return this.resupplyId;
  }

  /** La version que l'écriture en cours posera : celle que l'écran relira. */
  get nextVersion(): number {
    return this.version + 1;
  }

  /**
   * Le réassort né de l'envoi qui a suivi `readVersion`, et de lui seul —
   * `null` sinon (E2, 2026-11-03, la politique de l'envoi du comptoir) :
   * chaque écriture avance la version d'un, donc un brouillon envoyé en
   * `readVersion + 1` est parti tel que le poste l'avait sous les yeux, et
   * un second « Envoyer » n'a rien à refaire.
   */
  sentAfter(readVersion: number): string | null {
    const replayed = this.currentStatus === "sent" && this.version === readVersion + 1;
    return replayed ? this.resupplyId : null;
  }

  /**
   * Refuse d'écrire un brouillon clos, ou lu dans une version périmée.
   *
   * @throws {BakehouseResupplyDraftClosedError} envoyé ou supprimé.
   * @throws {BakehouseResupplyDraftChangedMeanwhileError} un autre poste l'a écrit depuis.
   */
  ensureWritable(readVersion: number): void {
    if (this.currentStatus !== "open") {
      throw new BakehouseResupplyDraftClosedError(this.id);
    }
    if (readVersion !== this.version) {
      throw new BakehouseResupplyDraftChangedMeanwhileError();
    }
  }

  /**
   * La même clé d'enregistrement rejouée par l'écran (C-C) : rendre ce
   * brouillon n'a de sens que pour le point qui l'a ouvert.
   *
   * @throws {BakehouseResupplyDraftKeyTakenError} la clé est celle d'un brouillon d'un autre point.
   */
  assertReplayableFor(siteId: string): void {
    if (siteId !== this.currentContent.siteId) {
      throw new BakehouseResupplyDraftKeyTakenError(this.id);
    }
  }

  /**
   * « Enregistrer » à nouveau : le contenu ENTIER remplace le précédent — au
   * même point seulement (D3).
   *
   * @throws {BakehouseResupplyDraftSiteFrozenError} le contenu vise un autre point.
   */
  save(content: BakehouseResupplyDraftContent, trace: ResupplyTrace, readVersion: number): void {
    this.ensureWritable(readVersion);
    if (content.siteId !== this.currentContent.siteId) {
      throw new BakehouseResupplyDraftSiteFrozenError(this.id);
    }
    this.currentContent = draftContentOf(content);
    this.updatedTrace = trace;
  }

  /** « Supprimer le brouillon » : un statut, jamais une suppression. */
  discard(trace: ResupplyTrace, readVersion: number): void {
    this.ensureWritable(readVersion);
    this.currentStatus = "discarded";
    this.updatedTrace = trace;
    this.closedTrace = trace;
  }

  /**
   * Envoyé : ce qui part est le contenu de l'écran, gardé avec le réassort
   * qui en est né.
   */
  markSent(input: {
    readonly content: BakehouseResupplyDraftContent;
    readonly resupplyId: string;
    readonly trace: ResupplyTrace;
    readonly readVersion: number;
  }): void {
    this.save(input.content, input.trace, input.readVersion);
    this.currentStatus = "sent";
    this.closedTrace = input.trace;
    this.resupplyId = input.resupplyId;
  }

  snapshot(): BakehouseResupplyDraftSnapshot {
    return {
      id: this.id,
      version: this.version,
      status: this.currentStatus,
      content: this.currentContent,
      created: this.created,
      updated: this.updatedTrace,
      closed: this.closedTrace,
      sentResupplyId: this.resupplyId,
    };
  }
}
