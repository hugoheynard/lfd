/**
 * **Le prix d'un candidat de la bibliothèque d'achat**
 * (`documentation/livraisons/chargement/plan-bibliotheque-d-achat.md`, B-D3) : saisi en
 * euros HT, envoyé en **centimes entiers**, affiché en euros.
 *
 * La saisie est lue comme du TEXTE, chiffre à chiffre : « 12,50 » devient
 * `1250` sans passer par un flottant, qui ferait de `0,29` un `28,999…`. La
 * borne haute et le signe restent au domaine ; l'écran refuse seulement ce
 * qu'il ne sait pas lire.
 */

/** Le résultat de la lecture : `null` = champ vide, c'est-à-dire « prix inconnu ». */
export type EurosReading =
  | { readonly ok: true; readonly cents: number | null }
  | { readonly ok: false; readonly issue: string };

const CENTS_PER_EURO = 100;
const CENT_DIGITS = 2;

/**
 * Des chiffres, groupés ou non par milliers (espace, espace insécable), puis
 * au plus deux décimales après une virgule ou un point.
 */
const EUROS_PATTERN = /^(\d{1,3}(?: \d{3})+|\d+)(?:[,.](\d{1,2}))?$/;

/** Espaces fines et insécables, que colle un tableur ou `Intl`, ramenées à l'espace. */
const SPACES = /[\u00a0\u202f]/g;

/** Lit « 1 234,56 » en `123456` ; vide → `null` ; refuse le signe, les lettres, un troisième chiffre après la virgule. */
export function parseEurosToCents(text: string): EurosReading {
  const trimmed = text.replace(SPACES, ' ').trim();
  if (trimmed === '') {
    return { ok: true, cents: null };
  }
  if (trimmed.startsWith('-') || trimmed.startsWith('−')) {
    return { ok: false, issue: 'Le prix ne peut pas être négatif.' };
  }
  if (/[,.]\d{3,}$/.test(trimmed)) {
    return { ok: false, issue: 'Le prix se saisit au centime : deux décimales au plus.' };
  }
  const match = EUROS_PATTERN.exec(trimmed);
  if (match === null) {
    return { ok: false, issue: 'Prix illisible : saisissez un montant comme « 12,50 ».' };
  }
  const whole = Number((match[1] ?? '').replaceAll(' ', ''));
  const fraction = Number((match[2] ?? '').padEnd(CENT_DIGITS, '0'));
  const cents = whole * CENTS_PER_EURO + fraction;
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, issue: 'Prix trop grand.' };
  }
  return { ok: true, cents };
}

/** `1250` → « 12,50 », pour remplir le champ d'une correction ; `null` → champ vide. */
export function centsToEurosInput(cents: number | null): string {
  if (cents === null) {
    return '';
  }
  const whole = Math.trunc(cents / CENTS_PER_EURO);
  const fraction = String(cents % CENTS_PER_EURO).padStart(CENT_DIGITS, '0');
  return `${String(whole)},${fraction}`;
}

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** « 12 500,00 € HT » ; `null` → « prix inconnu », jamais zéro (B-D3). */
export function priceLabel(cents: number | null): string {
  return cents === null ? 'prix inconnu' : `${EUROS.format(cents / CENTS_PER_EURO)} HT`;
}

/** Un montant de coût : « 1 234,00 € HT », ou « inconnu ». */
export function costLabel(cents: number | null): string {
  return cents === null ? 'inconnu' : `${EUROS.format(cents / CENTS_PER_EURO)} HT`;
}

/** Un coût par litre, en centimes par litre : « 0,42 €/L HT », ou « inconnu ». */
export function costPerLiterLabel(cents: number | null): string {
  return cents === null ? 'inconnu' : `${EUROS.format(cents / CENTS_PER_EURO)}/L HT`;
}
