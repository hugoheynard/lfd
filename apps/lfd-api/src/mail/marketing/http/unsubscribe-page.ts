import { MAIL_LOCALES, type MailLocale } from "@lfd/mail-blocks";

import { UNSUBSCRIBE_PAGE_COPY, type UnsubscribePageCopy } from "./unsubscribe-page-copy.js";

/** Sans préférence lisible, la langue de la maison. */
const DEFAULT_LOCALE: MailLocale = "fr";

/** Le nom du champ de la case « tout le groupe », et sa valeur cochée. */
export const WHOLE_GROUP_FIELD = "group";
export const WHOLE_GROUP_VALUE = "all";

/**
 * La langue de la page, lue dans `Accept-Language` : la première langue
 * connue par ordre de préférence (`q`), sinon le français.
 */
export function pageLocaleOf(acceptLanguage: string | undefined): MailLocale {
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([0-9.]+)\s*$/u.exec(p)?.[1]).find(Boolean);
      return {
        tag: tag.toLowerCase().split("-")[0] ?? "",
        q: q === undefined ? 1 : Number(q),
        index,
      };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const entry of ranked) {
    const known = MAIL_LOCALES.find((locale) => locale === entry.tag);
    if (known !== undefined) {
      return known;
    }
  }
  return DEFAULT_LOCALE;
}

/**
 * La CSP propre à la page (contradiction : « pas d'oracle par la page ») :
 * rien ne se charge, les styles sont en ligne, le formulaire ne poste que
 * vers lui-même.
 */
export const UNSUBSCRIBE_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; " +
  "base-uri 'none'; frame-ancestors 'none'";

const STYLE =
  "body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;" +
  "color:#1f1f1f;line-height:1.5}button{font:inherit;padding:.6rem 1.2rem;border:0;" +
  "border-radius:.4rem;background:#1f1f1f;color:#fff;cursor:pointer}label{display:block;" +
  "margin:1rem 0}";

function frame(locale: MailLocale, copy: UnsubscribePageCopy, body: string): string {
  return (
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex"><title>${copy.title}</title>` +
    `<style>${STYLE}</style></head><body><h1>${copy.title}</h1>${body}</body></html>`
  );
}

/**
 * La page du `GET` : une question et un bouton qui POSTE vers la même
 * adresse. Elle ne lit pas le jeton — elle est la même pour tous.
 */
export function confirmPage(locale: MailLocale, offerGroup: boolean): string {
  const copy = UNSUBSCRIBE_PAGE_COPY[locale];
  const group = offerGroup
    ? `<label><input type="checkbox" name="${WHOLE_GROUP_FIELD}" value="${WHOLE_GROUP_VALUE}"> ` +
      `${copy.wholeGroup}</label>`
    : "";
  return frame(
    locale,
    copy,
    `<p>${copy.ask}</p><p>${copy.keepsTransactional}</p>` +
      `<form method="post">${group}<button type="submit">${copy.confirm}</button></form>`,
  );
}

/** La page du `POST` : la même réponse, quel que soit le jeton. */
export function donePage(locale: MailLocale): string {
  const copy = UNSUBSCRIBE_PAGE_COPY[locale];
  return frame(locale, copy, `<p>${copy.done}</p><p>${copy.keepsTransactional}</p>`);
}
