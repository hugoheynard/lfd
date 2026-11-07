import type { MailCharterSettings } from "@lfd/mail-blocks";

import {
  MailCharterChangedError,
  MailCharterLogoNotCopiedError,
  MailCharterRefusedError,
  NothingToPublishForCharterError,
} from "../mail-charter-errors.js";
import { MailSpaceCharter } from "../mail-space-charter.js";

const STAMP = { at: new Date(0), staffId: "fiche-colette" };
const COPY = "https://mail.lfd.test/images/logo-lfd.png";

const STARTING: MailCharterSettings = {
  logo: null,
  colors: {
    page: "#fdfcfb",
    card: "#ffffff",
    text: "#0f172a",
    mutedText: "#64748b",
    primary: "#24448f",
    border: "#e2e8f0",
  },
  darkColors: { page: "#0b1220", card: "#111a2e", text: "#e5e9f2", border: "#26324a" },
  headingFont: null,
  footer: {},
};

const WITH_LOGO: MailCharterSettings = {
  ...STARTING,
  logo: { src: "https://media.lfd.test/logo-lfd.png", alt: { fr: "La Folie Douce" } },
};

function drafted(settings: MailCharterSettings): MailSpaceCharter {
  const charter = MailSpaceCharter.untouched("lfd");
  charter.saveDraft(settings, 0, STAMP);
  return charter;
}

describe("MailSpaceCharter", () => {
  it("s'ouvre sur la charte de départ tant que rien n'est écrit", () => {
    expect(MailSpaceCharter.untouched("lfd").current(STARTING)).toEqual({
      settings: STARTING,
      source: "starting",
    });
  });

  it("enregistre un brouillon, qui devient ce que l'écran ouvre", () => {
    const charter = drafted(WITH_LOGO);
    expect(charter.current(STARTING)).toEqual({ settings: WITH_LOGO, source: "draft" });
    expect(charter.snapshot().revision).toBe(1);
  });

  it("refuse à l'enregistrement une couleur qui n'est pas #rrggbb", () => {
    const charter = MailSpaceCharter.untouched("lfd");
    const bad = { ...STARTING, colors: { ...STARTING.colors, text: "noir" } };
    expect(() => charter.saveDraft(bad, 0, STAMP)).toThrow(MailCharterRefusedError);
    expect(charter.snapshot().revision).toBe(0);
  });

  it("refuse une écriture sur une révision dépassée", () => {
    const charter = drafted(STARTING);
    expect(() => charter.saveDraft(STARTING, 0, STAMP)).toThrow(MailCharterChangedError);
  });

  it("refuse de publier sans brouillon", () => {
    expect(() => MailSpaceCharter.untouched("lfd").publish(["fr"], 0, STAMP, null)).toThrow(
      NothingToPublishForCharterError,
    );
  });

  /** RGAA 3.2 : un texte gris pâle sur blanc ne se lit pas ; la publication le refuse, l'enregistrement non. */
  it("refuse de publier un contraste sous 4,5:1, en le nommant", () => {
    const pale = { ...STARTING, colors: { ...STARTING.colors, mutedText: "#bbbbbb" } };
    const charter = drafted(pale);
    expect(() => charter.publish(["fr"], 1, STAMP, null)).toThrow(
      /texte secondaire et le fond de la carte est de 1,9\d:1/u,
    );
    expect(charter.publishedVersion).toBeNull();
  });

  it("refuse de publier un logo sans texte de remplacement dans une langue de l'espace", () => {
    expect(() => drafted(WITH_LOGO).publishableDraft(["fr", "en"], 1)).toThrow(
      /pas de texte de remplacement en anglais/u,
    );
  });

  it("publie la version suivante, logo pointant vers sa copie, et solde le brouillon", () => {
    const charter = drafted(WITH_LOGO);
    const published = charter.publish(["fr"], 1, STAMP, COPY);
    expect(published.version).toBe(1);
    expect(published.settings.logo?.src).toBe(COPY);
    expect(charter.appendedVersion).toBe(published);
    expect(charter.current(STARTING)).toEqual({
      settings: published.settings,
      source: "published",
    });
    expect(charter.snapshot()).toMatchObject({ revision: 2, draft: null, lastVersion: 1 });
  });

  it("refuse de publier un logo choisi sans sa copie", () => {
    expect(() => drafted(WITH_LOGO).publish(["fr"], 1, STAMP, null)).toThrow(
      MailCharterLogoNotCopiedError,
    );
  });

  it("refuse une copie de logo quand la charte garde le logo embarqué", () => {
    expect(() => drafted(STARTING).publish(["fr"], 1, STAMP, COPY)).toThrow(
      MailCharterLogoNotCopiedError,
    );
  });

  it("numérote les publications à la suite", () => {
    const charter = drafted(STARTING);
    charter.publish(["fr"], 1, STAMP, null);
    const again = MailSpaceCharter.reconstitute(charter.snapshot());
    again.saveDraft(WITH_LOGO, 2, STAMP);
    expect(again.publish(["fr"], 3, STAMP, COPY).version).toBe(2);
  });
});
