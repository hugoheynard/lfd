import { LAYOUT_SECTIONS, type RenderedMail } from "@lfd/mailer";

import manifestJson from "../../copy/mail-copy-manifest.json" with { type: "json" };
import { b2bMailTemplates, type B2bMails } from "../../mail-templates.js";
import { MAIL_CASES } from "../../__tests__/rendering-golden/mail-rendering.cases.js";
import { withMailLayout } from "../mail-layout-scope.js";
import { MAIL_LAYOUTS, mailLayouts, type ResolvedMailLayout } from "../mail-layouts.js";
import { revealTextMarkers, stripTextMarkers } from "../mail-text-markers.js";

/**
 * **Les sections déclarées disent la vérité sur le rendu** (plan
 * `plan-textes-des-e-mails.md`, E4, S1, S4, S5).
 *
 * Les 81 cas de l'empreinte de rendu passent par chaque branche de chaque
 * gabarit : rendus en aperçu repéré, ils montrent où chaque texte s'affiche
 * réellement, et c'est contre ce constat que la déclaration est éprouvée.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});
const MANIFEST: Readonly<Record<string, Readonly<Record<string, unknown>>>> = manifestJson.mails;
const KEYS = Object.keys(MAIL_CASES) as readonly (keyof B2bMails)[];

/**
 * Les textes déclarés qu'aucun cas ne montre EN TEXTE, chacun pour sa raison
 * (vu le 2026-10-23) — la liste ne grandit pas sans la sienne.
 */
const NOT_SHOWN_AS_TEXT = new Set([
  // Jamais rendus : le dictionnaire les porte, aucun gabarit ne les lit.
  "customer.order-placed|qrTitle",
  "customer.order-ready|qrTitle",
  // Texte de repli de l'image : un attribut `alt`, où un repère n'a pas sa place.
  "customer.order-placed|qrAlt",
  "customer.order-ready|qrAlt",
  // Le ticket dure une heure : la forme « plusieurs heures » attend qu'il dure plus.
  "customer.password-reset|validityHours",
  // Branches qu'aucun cas de l'empreinte ne parcourt.
  "customer.sub-account-gesture|bodyByTeam",
  "staff.production-dossier|arrestedWithoutAuthor",
  "customer.order-placed|recapDiscountBase",
  // Les replis de l'ouverture (sans lieu, sans ville) et le créneau :
  // `order-placed-intro.spec.ts` les parcourt, aucun cas de l'empreinte.
  "customer.order-placed|routingPickupWithoutPlace",
  "customer.order-placed|routingDeliveryWithoutCity",
  "customer.order-placed|windowBetween",
  "customer.order-placed|windowBefore",
  // Une ligne au poids (`plan-vente-au-poids.md`, P3) : aucun cas de
  // l'empreinte n'en porte — les empreintes à la pièce restent celles d'avant ;
  // `order-mail-content.spec.ts` et `order-placed-mail.spec.ts` les parcourent.
  "customer.order-placed|recapWeighed",
  "customer.order-ready|weighedLabel",
  // La proposition d'« Écrire au client » (E6d) : elle rédige le texte que
  // l'équipe relit ; le courriel rend le texte relu, une donnée.
  "customer.order-shortfall|intro",
  "customer.order-shortfall|departedHeading",
  "customer.order-shortfall|missingHeading",
  "customer.order-shortfall|line",
  "customer.order-shortfall|contactSales",
  "customer.order-shortfall|closing",
]);

function render<K extends keyof B2bMails>(key: K, data: B2bMails[K]): RenderedMail {
  const run: (input: B2bMails[K]) => RenderedMail = REGISTRY[key];
  return run(data);
}

function renderAll<T>(
  key: keyof B2bMails,
  each: (mail: RenderedMail, plain: RenderedMail) => T,
): readonly T[] {
  return Object.values(MAIL_CASES[key]).map((data: B2bMails[typeof key]) => {
    const plain = render(key, data);
    const marked = withMailLayout({ orders: {}, markers: true }, () => render(key, data));
    return each(marked, plain);
  });
}

/** Chemin → sections où il s'affiche, pour les textes de CET e-mail. */
function observedSections(key: string, html: string): Map<string, Set<string>> {
  const seen = new Map<string, Set<string>>();
  for (const block of html.matchAll(/<div data-mail-section="([^"]+)">([\s\S]*?)<\/div>/gu)) {
    const [, section = "", inner = ""] = block;
    for (const text of inner.matchAll(/data-mail-text="([^"]+)" data-mail-text-of="([^"]+)"/gu)) {
      const [, path = "", mail = ""] = text;
      if (mail === key) {
        seen.set(path, (seen.get(path) ?? new Set<string>()).add(section));
      }
    }
  }
  return seen;
}

function homeOf(layout: ResolvedMailLayout, path: string): readonly string[] {
  return [
    ...(layout.subject.some((text) => text.path === path) ? ["subject"] : []),
    ...(layout.header.some((text) => text.path === path) ? ["header"] : []),
    ...layout.sections.filter((s) => s.texts.some((t) => t.path === path)).map((s) => s.id),
  ];
}

describe("les sections déclarées de chaque e-mail", () => {
  it("couvrent exactement le registre", () => {
    expect(Object.keys(MAIL_LAYOUTS).sort()).toEqual(Object.keys(REGISTRY).sort());
  });

  it.each(mailLayouts().map((layout) => [layout.mail, layout] as const))(
    "%s : chaque texte du dictionnaire a UNE place, sections dans l'ordre de la coquille",
    (mail, layout) => {
      const known = Object.keys(MANIFEST[mail] ?? {}).sort();
      const declared = [
        ...layout.subject,
        ...layout.header,
        ...layout.sections.flatMap((section) => section.texts),
      ].map((text) => text.path);
      expect([...declared].sort()).toEqual(known);
      const ids = layout.sections.map((section) => section.id);
      expect(ids).toEqual(LAYOUT_SECTIONS.filter((id) => ids.includes(id)));
    },
  );
});

describe.each(KEYS)("le rendu repéré de « %s »", (key) => {
  const layout = mailLayouts().find((candidate) => candidate.mail === key);

  it("ôte ses repères, rend exactement l'e-mail envoyé", () => {
    renderAll(key, (marked, plain) => {
      const html = stripTextMarkers(marked.html)
        .replace(/<div data-mail-section="[^"]+">/gu, "")
        .replace(/<\/div>/gu, "");
      expect(html).toBe(plain.html);
      expect(stripTextMarkers(marked.subject)).toBe(plain.subject);
    });
  });

  it("montre chaque texte dans la section qui le déclare", () => {
    const seen = new Map<string, Set<string>>();
    renderAll(key, (marked) => {
      for (const [path, sections] of observedSections(key, revealTextMarkers(marked.html))) {
        seen.set(path, new Set([...(seen.get(path) ?? []), ...sections]));
      }
    });
    for (const [path, sections] of seen) {
      const home = layout === undefined ? [] : homeOf(layout, path);
      expect({ path, homes: home.length }).toEqual({ path, homes: 1 });
      const [where = ""] = home;
      if (where !== "subject" && where !== "header") {
        expect({ path, shownInItsSection: sections.has(where) }).toEqual({
          path,
          shownInItsSection: true,
        });
      }
    }
    const unseen = (layout?.sections ?? [])
      .flatMap((section) => section.texts.map((text) => text.path))
      .filter((path) => !seen.has(path) && !NOT_SHOWN_AS_TEXT.has(`${key}|${path}`));
    expect(unseen).toEqual([]);
  });
});
