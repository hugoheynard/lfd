import type { MailCharterSettings } from "@lfd/mail-blocks";

import { StoredMailCharterUnreadableError } from "../../domain/mail-charter-errors.js";
import { charterSettingsJson, toCharterState, type MailCharterRow } from "../mail-charter-rows.js";

const SETTINGS: MailCharterSettings = {
  logo: { src: "https://mail.lfd.test/images/logo.png", alt: { fr: "La Folie Douce" } },
  colors: {
    page: "#fdfcfb",
    card: "#ffffff",
    text: "#0f172a",
    mutedText: "#64748b",
    primary: "#24448f",
    border: "#e2e8f0",
  },
  darkColors: { page: "#0b1220", card: "#111a2e", text: "#e5e9f2", border: "#26324a" },
  headingFont: { family: "Chunk", url: "https://lfc.test/chunk.woff2", fallback: "serif" },
  footer: { fr: "Lyon" },
};

const ROW: MailCharterRow = {
  space: "lfd",
  revision: 2,
  draft: null,
  draftAt: null,
  draftBy: null,
  published: {
    logo: { src: "https://mail.lfd.test/images/logo.png", alt: { fr: "La Folie Douce" } },
    colors: {
      page: "#fdfcfb",
      card: "#ffffff",
      text: "#0f172a",
      mutedText: "#64748b",
      primary: "#24448f",
      border: "#e2e8f0",
    },
    darkColors: { page: "#0b1220", card: "#111a2e", text: "#e5e9f2", border: "#26324a" },
    headingFont: { family: "Chunk", url: "https://lfc.test/chunk.woff2", fallback: "serif" },
    footer: { fr: "Lyon" },
  },
  publishedVersion: 1,
  publishedAt: new Date(0),
  publishedBy: "fiche-colette",
  lastVersion: 1,
};

describe("les lignes de la charte", () => {
  it("relisent ce qu'elles ont écrit", () => {
    expect(toCharterState(ROW)).toEqual({
      space: "lfd",
      revision: 2,
      draft: null,
      published: {
        settings: SETTINGS,
        version: 1,
        stamp: { at: new Date(0), staffId: "fiche-colette" },
      },
      lastVersion: 1,
    });
  });

  it("écrivent ce qu'elles relisent, sans langue absente", () => {
    expect(charterSettingsJson(SETTINGS)).toEqual(ROW.published);
    expect(charterSettingsJson({ ...SETTINGS, footer: {} })).toMatchObject({ footer: {} });
  });

  it("refusent tout haut une charte rangée qui n'en a plus la forme", () => {
    expect(() => toCharterState({ ...ROW, published: { couleurs: "bleu" } })).toThrow(
      StoredMailCharterUnreadableError,
    );
  });

  it("refusent un espace que ce code ne connaît pas", () => {
    expect(() => toCharterState({ ...ROW, space: "internal" })).toThrow(
      StoredMailCharterUnreadableError,
    );
  });
});
