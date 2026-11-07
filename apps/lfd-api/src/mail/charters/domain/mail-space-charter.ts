import {
  validateMailCharter,
  validateMailCharterForPublication,
  type MailCharterSettings,
  type MailLocale,
  type MailSpace,
} from "@lfd/mail-blocks";

import {
  MailCharterChangedError,
  MailCharterLogoNotCopiedError,
  MailCharterRefusedError,
  NothingToPublishForCharterError,
} from "./mail-charter-errors.js";

/** Un geste daté et signé — l'identifiant INTERNE de la fiche staff. */
export interface MailCharterStamp {
  readonly at: Date;
  readonly staffId: string;
}

/** Une charte publiée : sa version, gardée en ajout seul, et qui l'a publiée. */
export interface PublishedMailCharter {
  readonly settings: MailCharterSettings;
  readonly version: number;
  readonly stamp: MailCharterStamp;
}

/** Le brouillon : les réglages, et leur dernier geste. */
export interface MailCharterDraft {
  readonly settings: MailCharterSettings;
  readonly stamp: MailCharterStamp;
}

/** L'état complet, tel que l'adaptateur le range et le relit. */
export interface MailSpaceCharterState {
  readonly space: MailSpace;
  /** 0 = jamais écrit (aucune ligne) : la charte de départ. */
  readonly revision: number;
  readonly draft: MailCharterDraft | null;
  readonly published: PublishedMailCharter | null;
  /** La dernière version posée : la suivante en part. */
  readonly lastVersion: number;
}

/** La charte que l'écran ouvre, et d'où elle vient. */
export interface CurrentMailCharter {
  readonly settings: MailCharterSettings;
  readonly source: "draft" | "published" | "starting";
}

/**
 * **La charte graphique d'un espace d'e-mails** — l'agrégat (plan
 * `plan-editeur-par-blocs.md`, § 25, C1) : un brouillon, une publiée, des
 * versions publiées qui ne se réécrivent jamais. Elle se publie comme un
 * e-mail.
 *
 * Elle refuse : des réglages que les règles du paquet refusent (à
 * l'enregistrement la forme, à la publication aussi le logo et son texte de
 * remplacement dans chaque langue de l'espace, et un contraste d'au moins
 * 4,5:1) ; toute écriture faite sur une révision que quelqu'un a dépassée ;
 * une publication sans brouillon ; un logo publié sans sa copie.
 */
export class MailSpaceCharter {
  private appended: PublishedMailCharter | null = null;

  private constructor(
    private state: MailSpaceCharterState,
    private readonly loaded: number,
  ) {}

  /** Un espace jamais réglé : rien n'est écrit tant qu'on ne le modifie pas. */
  static untouched(space: MailSpace): MailSpaceCharter {
    return new MailSpaceCharter(
      { space, revision: 0, draft: null, published: null, lastVersion: 0 },
      0,
    );
  }

  static reconstitute(state: MailSpaceCharterState): MailSpaceCharter {
    return new MailSpaceCharter(state, state.revision);
  }

  get space(): MailSpace {
    return this.state.space;
  }

  /** La révision lue — la condition de l'écriture. */
  get loadedRevision(): number {
    return this.loaded;
  }

  /** La version publiée par CE geste, à ajouter à l'historique ; `null` sinon. */
  get appendedVersion(): PublishedMailCharter | null {
    return this.appended;
  }

  /** La version publiée qui sert aujourd'hui ; `null` : la charte de départ. */
  get publishedVersion(): number | null {
    return this.state.published?.version ?? null;
  }

  /** La charte que l'écran ouvre : le brouillon, sinon la publiée, sinon celle de départ. */
  current(starting: MailCharterSettings): CurrentMailCharter {
    if (this.state.draft !== null) {
      return { settings: this.state.draft.settings, source: "draft" };
    }
    if (this.state.published !== null) {
      return { settings: this.state.published.settings, source: "published" };
    }
    return { settings: starting, source: "starting" };
  }

  /**
   * Enregistre le brouillon.
   *
   * @throws {MailCharterChangedError} la révision lue est dépassée.
   * @throws {MailCharterRefusedError} un réglage enfreint une règle de forme.
   */
  saveDraft(
    settings: MailCharterSettings,
    expectedRevision: number,
    stamp: MailCharterStamp,
  ): void {
    this.assertRevision(expectedRevision);
    const violations = validateMailCharter(settings);
    if (violations.length > 0) {
      throw new MailCharterRefusedError(this.state.space, "enregistrée", violations);
    }
    this.state = { ...this.state, revision: this.state.revision + 1, draft: { settings, stamp } };
  }

  /**
   * Le brouillon tel qu'il serait publié, vérifié sans rien changer — ce que
   * la publication lit AVANT sa transaction pour en copier le logo.
   *
   * @throws {MailCharterChangedError} la révision lue est dépassée.
   * @throws {NothingToPublishForCharterError} aucun brouillon.
   * @throws {MailCharterRefusedError} une règle de publication est enfreinte.
   */
  publishableDraft(locales: readonly MailLocale[], expectedRevision: number): MailCharterSettings {
    this.assertRevision(expectedRevision);
    const draft = this.state.draft;
    if (draft === null) {
      throw new NothingToPublishForCharterError(this.state.space);
    }
    const violations = validateMailCharterForPublication(draft.settings, locales);
    if (violations.length > 0) {
      throw new MailCharterRefusedError(this.state.space, "publiée", violations);
    }
    return draft.settings;
  }

  /**
   * Publie le brouillon : il devient la version suivante, gardée en ajout
   * seul, où le logo pointe vers sa copie (`logoCopy` : l'adresse de la copie,
   * `null` si la charte garde le logo embarqué).
   *
   * @throws {MailCharterChangedError} la révision lue est dépassée.
   * @throws {NothingToPublishForCharterError} aucun brouillon.
   * @throws {MailCharterRefusedError} une règle de publication est enfreinte.
   * @throws {MailCharterLogoNotCopiedError} le logo choisi n'a pas de copie.
   */
  publish(
    locales: readonly MailLocale[],
    expectedRevision: number,
    stamp: MailCharterStamp,
    logoCopy: string | null,
  ): PublishedMailCharter {
    const draft = this.publishableDraft(locales, expectedRevision);
    if ((draft.logo === null) !== (logoCopy === null)) {
      throw new MailCharterLogoNotCopiedError(this.state.space);
    }
    const settings: MailCharterSettings =
      draft.logo === null || logoCopy === null
        ? draft
        : { ...draft, logo: { ...draft.logo, src: logoCopy } };
    const published = { settings, version: this.state.lastVersion + 1, stamp };
    this.state = {
      ...this.state,
      revision: this.state.revision + 1,
      draft: null,
      published,
      lastVersion: published.version,
    };
    this.appended = published;
    return published;
  }

  snapshot(): MailSpaceCharterState {
    return this.state;
  }

  private assertRevision(expectedRevision: number): void {
    if (expectedRevision !== this.state.revision) {
      throw new MailCharterChangedError(this.state.space);
    }
  }
}
