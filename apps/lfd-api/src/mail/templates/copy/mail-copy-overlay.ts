import { AsyncLocalStorage } from "node:async_hooks";

import type { ContentLocale } from "@lfd/contracts";

import type { MailCopy } from "./mail-copy.model.js";

/**
 * Les textes d'une langue qui REMPLACENT ceux du code : e-mail du registre →
 * chemin du texte dans sa section (`subject`, `title.paid`) → texte.
 */
export type MailCopyTexts = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * **Les remplacements à appliquer au rendu**, par langue (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, C2).
 *
 * Une langue absente, un e-mail absent, un chemin absent : le texte du code.
 */
export type MailCopyOverlay = Readonly<Partial<Record<ContentLocale, MailCopyTexts>>>;

/** Aucun remplacement : le rendu d'aujourd'hui, octet pour octet. */
export const NO_MAIL_COPY_OVERLAY: MailCopyOverlay = {};

const scope = new AsyncLocalStorage<MailCopyOverlay>();
const merged = new WeakMap<MailCopyOverlay, Map<ContentLocale, MailCopy>>();

/**
 * Rend `run` avec ces remplacements : tout `mailCopyOf` appelé pendant `run`
 * — y compris après un `await` — lit le texte remplacé.
 *
 * Pourquoi un périmètre plutôt qu'un paramètre : les vingt-huit gabarits
 * lisent le dictionnaire par `mailCopyOf(locale)`, au fond de leurs fonctions
 * de rendu, et `@lfd/mailer` les appelle de façon SYNCHRONE avec les seules
 * données de l'e-mail. Faire descendre un dictionnaire jusqu'à eux aurait
 * changé la signature de chaque rendu ; le périmètre ne change aucun octet
 * quand rien n'est remplacé (`mail-rendering-golden.spec.ts`).
 */
export function withMailCopyOverlay<T>(overlay: MailCopyOverlay, run: () => T): T {
  return scope.run(overlay, run);
}

/** Le périmètre ouvert, s'il y en a un. */
export function activeMailCopyOverlay(): MailCopyOverlay | undefined {
  return scope.getStore();
}

/**
 * Le dictionnaire d'une langue avec ses remplacements — calculé une fois par
 * (jeu de remplacements, langue), puis gardé tant que le jeu vit.
 */
export function overlaidMailCopy(
  base: MailCopy,
  overlay: MailCopyOverlay,
  locale: ContentLocale,
): MailCopy {
  const texts = overlay[locale];
  if (texts === undefined || Object.keys(texts).length === 0) {
    return base;
  }
  const byLocale = merged.get(overlay) ?? new Map<ContentLocale, MailCopy>();
  merged.set(overlay, byLocale);
  const known = byLocale.get(locale);
  if (known !== undefined) {
    return known;
  }
  const copy = structuredClone(base);
  for (const [mail, paths] of Object.entries(texts)) {
    for (const [path, text] of Object.entries(paths)) {
      replaceText(Reflect.get(copy, mail), path.split("."), text);
    }
  }
  byLocale.set(locale, copy);
  return copy;
}

/**
 * Remplace le texte au bout du chemin, SEULEMENT s'il y en a déjà un : un
 * chemin que le code ne connaît plus (un texte retiré, renommé) n'ajoute
 * rien — il ne change ni la forme du dictionnaire, ni ce qu'un gabarit lit.
 */
function replaceText(node: unknown, path: readonly string[], text: string): void {
  const [head, ...rest] = path;
  if (
    head === undefined ||
    typeof node !== "object" ||
    node === null ||
    !Object.hasOwn(node, head)
  ) {
    return;
  }
  const child: unknown = Reflect.get(node, head);
  if (rest.length > 0) {
    replaceText(child, rest, text);
    return;
  }
  if (typeof child === "string") {
    Reflect.set(node, head, text);
  }
}
