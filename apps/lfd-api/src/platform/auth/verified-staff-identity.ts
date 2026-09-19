import type { StaffPrincipal } from "./staff-principal.js";

/**
 * **Le canal interne entre les deux gardes staff** — et le seul endroit où le
 * `sub` d'un membre du staff existe encore une fois la requête entrée.
 *
 * `AdminAuthGuard` y dépose ce que le jeton prouve ; `StaffAccessGuard` l'y
 * **reprend** pour résoudre la fiche, et l'efface du même geste. Après lui, la
 * requête ne porte plus que `access` : un contrôleur ne peut plus lire un `sub`,
 * ni par un champ, ni par un décorateur, ni par une déstructuration — le moyen
 * a disparu, là où une règle aurait dû surveiller l'usage
 * (`documentation/journalisation/architecture-journalisation.md` §12, D2).
 *
 * Une `WeakMap` indexée par la requête plutôt qu'un champ caché : elle n'est
 * atteignable que par ces deux fonctions, et elle ne retient rien après la
 * requête. Ce fichier n'est importé que depuis `platform/auth/` —
 * `lint:subject-readers` le refuse ailleurs.
 */
const verifiedStaff = new WeakMap<object, StaffPrincipal>();

/** Dépose l'identité que le jeton vient de prouver. Appelé par le seul garde d'entrée. */
export function depositVerifiedStaff(request: object, principal: StaffPrincipal): void {
  verifiedStaff.set(request, principal);
}

/**
 * Reprend l'identité déposée, et l'efface : une fois la fiche résolue, plus
 * personne n'a de raison de connaître le `sub`.
 *
 * @returns `undefined` si le garde d'entrée n'a pas tourné sur cette requête.
 */
export function takeVerifiedStaff(request: object): StaffPrincipal | undefined {
  const principal = verifiedStaff.get(request);
  verifiedStaff.delete(request);
  return principal;
}
