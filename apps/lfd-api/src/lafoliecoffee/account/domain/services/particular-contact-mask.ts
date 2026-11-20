import { phoneMatchKey } from "./phone-match-key.js";

const SHOWN_DIGITS = 2;
const HIDDEN_PAIR = "••";
const HIDDEN_LOCAL = "***";

/**
 * Masque une adresse : la première lettre, puis le domaine (`j***@gmail.com`).
 *
 * Assez pour qu'un vendeur demande « c'est bien jean… chez gmail ? », pas
 * assez pour qu'il relève l'adresse d'un particulier qu'il ne sert pas.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) {
    return HIDDEN_LOCAL;
  }
  return `${email.charAt(0)}${HIDDEN_LOCAL}${email.slice(at)}`;
}

/**
 * Masque un téléphone : les deux premiers et les deux derniers chiffres, le
 * reste par paires (`06 •• •• •• 12`). Vide si la fiche n'en a pas.
 */
export function maskPhone(phone: string): string {
  const digits = phoneMatchKey(phone);
  if (digits === "") {
    return "";
  }
  if (digits.length <= SHOWN_DIGITS * 2) {
    return HIDDEN_PAIR;
  }
  const hiddenPairs = Math.ceil((digits.length - SHOWN_DIGITS * 2) / 2);
  const middle = Array.from({ length: hiddenPairs }, () => HIDDEN_PAIR).join(" ");
  return `${digits.slice(0, SHOWN_DIGITS)} ${middle} ${digits.slice(-SHOWN_DIGITS)}`;
}
