import type {
  MailCharterSettings,
  MailCharterShopFonts,
  MailLocale,
  MailSpace,
} from "@lfd/mail-blocks";

import { MailCharterChangedError } from "../../domain/mail-charter-errors.js";
import {
  MailSpaceCharter,
  type MailSpaceCharterState,
  type PublishedMailCharter,
} from "../../domain/mail-space-charter.js";
import { MailCharterLogo } from "../../domain/ports/mail-charter-logo.js";
import {
  MailCharterPreviewRenderer,
  type MailCharterPreview,
} from "../../domain/ports/mail-charter-preview.renderer.js";
import { MailCharterReader } from "../../domain/ports/mail-charter.reader.js";
import { MailSpaceCharterRepository } from "../../domain/ports/mail-space-charter.repository.js";
import { MailSpaceDirectory } from "../../domain/ports/mail-space-directory.js";

/** Les réglages d'aujourd'hui — la charte de départ de la suite. */
export const STARTING_SETTINGS: MailCharterSettings = {
  logo: null,
  colors: {
    page: "#fdfcfb",
    card: "#ffffff",
    text: "#0f172a",
    mutedText: "#64748b",
    primary: "#24448f",
    band: "#1a3157",
    border: "#e2e8f0",
  },
  darkColors: { page: "#0b1220", card: "#111a2e", text: "#e5e9f2", border: "#26324a" },
  headingFont: null,
  textFont: null,
  footer: {},
};

/** Les polices de la boutique, telles que l'adresse de la boutique les donne. */
export const SHOP_FONTS: MailCharterShopFonts = {
  heading: {
    family: "Chunk",
    url: "https://lfc.test/brand/fonts/chunk-400.woff2",
    fallback: "'Arial Black', Impact, sans-serif",
  },
  text: {
    family: "Pogonia",
    url: "https://lfc.test/brand/fonts/pogonia-400.woff2",
    fallback: "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  },
};

/** Une charte réglée, logo choisi dans la médiathèque. */
export const LFD_SETTINGS: MailCharterSettings = {
  ...STARTING_SETTINGS,
  logo: { src: "https://media.lfd.test/logo-lfd.png", alt: { fr: "La Folie Douce" } },
  colors: { ...STARTING_SETTINGS.colors, primary: "#7a1f3d" },
  footer: { fr: "La Folie Douce — Lyon" },
};

/** La charte en mémoire, avec le MÊME verrou que l'adaptateur. */
export class InMemoryMailCharters extends MailSpaceCharterRepository {
  readonly rows = new Map<MailSpace, MailSpaceCharterState>();
  readonly versions: { space: MailSpace; record: PublishedMailCharter }[] = [];

  load(space: MailSpace): Promise<MailSpaceCharter> {
    const state = this.rows.get(space);
    return Promise.resolve(
      state === undefined
        ? MailSpaceCharter.untouched(space)
        : MailSpaceCharter.reconstitute(state),
    );
  }

  save(charter: MailSpaceCharter): Promise<void> {
    if ((this.rows.get(charter.space)?.revision ?? 0) !== charter.loadedRevision) {
      return Promise.reject(new MailCharterChangedError(charter.space));
    }
    this.rows.set(charter.space, charter.snapshot());
    const appended = charter.appendedVersion;
    if (appended !== null) {
      this.versions.push({ space: charter.space, record: appended });
    }
    return Promise.resolve();
  }
}

/** La lecture de la page, sur le même état. */
export class InMemoryMailCharterReader extends MailCharterReader {
  constructor(private readonly charters: InMemoryMailCharters) {
    super();
  }

  stateOf(space: MailSpace): Promise<MailSpaceCharterState | null> {
    return Promise.resolve(this.charters.rows.get(space) ?? null);
  }

  versions(space: MailSpace): Promise<readonly PublishedMailCharter[]> {
    return Promise.resolve(
      this.charters.versions
        .filter((entry) => entry.space === space)
        .map((entry) => entry.record)
        .reverse(),
    );
  }
}

/** Deux espaces réduits : `lfc` en trois langues, `lfd` (internes compris) en français. */
export class FixedSpaceDirectory extends MailSpaceDirectory {
  templatesOf(space: MailSpace): readonly string[] {
    return space === "lfc" ? ["customer.order-placed"] : ["staff.invited", "staff.account-alert"];
  }

  localesOf(space: MailSpace): readonly MailLocale[] {
    return space === "lfc" ? ["fr", "en", "it"] : ["fr"];
  }

  startingSettings(): MailCharterSettings {
    return STARTING_SETTINGS;
  }

  shopFontsOf(space: MailSpace): MailCharterShopFonts | null {
    return space === "lfc" ? SHOP_FONTS : null;
  }
}

/** La copie du logo doublée : une adresse sous la base du bloc, ou le refus demandé. */
export class RecordingCharterLogo extends MailCharterLogo {
  static readonly COPY_BASE = "https://mail.lfd.test/images/";
  readonly calls: string[] = [];

  constructor(private readonly refusal: Error | null = null) {
    super();
  }

  copy(sourceUrl: string): Promise<string> {
    this.calls.push(sourceUrl);
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    return Promise.resolve(`${RecordingCharterLogo.COPY_BASE}${sourceUrl.split("/").pop() ?? ""}`);
  }
}

/** Un aperçu qui dit ce qu'on lui a demandé. */
export class RecordingCharterPreview extends MailCharterPreviewRenderer {
  readonly calls: { template: string; locale: MailLocale; settings: MailCharterSettings }[] = [];

  render(
    template: string,
    locale: MailLocale,
    settings: MailCharterSettings,
  ): Promise<MailCharterPreview> {
    this.calls.push({ template, locale, settings });
    return Promise.resolve({ subject: template, html: `<p>${settings.colors.primary}</p>` });
  }
}
