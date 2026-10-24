/**
 * Les cellules des CSV — **une seule façon** d'écrire un montant et un texte
 * pour un tableur français.
 *
 * Sortis de `pain008-audit.ts` le 2026-10-05, quand le relevé de cycle a eu
 * besoin des mêmes : deux CSV du même service qui n'écriraient pas les euros de
 * la même façon s'ouvriraient différemment chez le même lecteur. Montés de
 * `b2b/accounting/` dans `platform/` le 2026-10-21, quand le récapitulatif des
 * commandes en a eu besoin (`documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`,
 * §6.7) : une règle de cellule sans métier, au lieu d'une cinquième copie.
 */

/** Le point-virgule : le séparateur qu'un tableur français attend. */
export const CSV_SEPARATOR = ";";

/**
 * Le BOM UTF-8, en séquence d'échappement et non en caractère.
 *
 * ⚠️ Écrit au naturel, il est **invisible à la relecture** — et rien ne l'attrape :
 * ni le typecheck, ni `no-irregular-whitespace` d'ESLint, qui ne le considère
 * pas comme une espace irrégulière à cette position. Un éditeur ou un outil de
 * normalisation peut alors le manger sans qu'un diff le montre, et le CSV
 * s'ouvre en Latin-1 chez le comptable. Constaté deux fois dans ce dépôt, dont
 * une le 2026-09-10 en écrivant `pain008-audit.ts`.
 */
export const CSV_BOM = "﻿";

/** Centimes → `1516,48`, virgule décimale et sans symbole : le tableur somme. */
export function csvEuros(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${String(Math.trunc(absolute / 100))},${String(absolute % 100).padStart(2, "0")}`;
}

/** Les premiers caractères qui font d'une cellule une formule pour un tableur. */
const FORMULA_LEADS = new Set(["=", "+", "-", "@"]);

/** Un nombre écrit à la française — `-12,50`, `1516`, `+5,5` : jamais une formule. */
const PLAIN_NUMBER = /^[+-]?\d+(?:,\d+)?$/u;

/**
 * Un texte qui commence par `=`, `+`, `-` ou `@` est lu comme une formule par
 * un tableur (injection de formule) : il est précédé d'une apostrophe, qui
 * le rend au texte. Un NOMBRE n'est pas neutralisé — « -12,50 » reste un
 * montant que le tableur somme.
 */
function neutralised(value: string): string {
  const lead = value.charAt(0);
  if (!FORMULA_LEADS.has(lead) || PLAIN_NUMBER.test(value)) {
    return value;
  }
  return `'${value}`;
}

/**
 * Tout est cité, y compris ce qui n'en a pas besoin, et neutralisé s'il
 * ressemble à une formule.
 *
 * Une raison sociale peut contenir un `;`, et un tableur décalerait alors toute
 * la ligne. Citer partout coûte deux caractères et supprime la question.
 */
export function csvQuoted(value: string): string {
  return `"${neutralised(value).replace(/"/gu, '""')}"`;
}
