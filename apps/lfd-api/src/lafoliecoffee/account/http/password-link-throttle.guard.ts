import { perAccountThrottleGuard } from "../../../platform/security/per-account-throttle.guard.js";

/**
 * Le débit de `POST /me/password-link` : **trois demandes par heure et par
 * compte** (plan `documentation/auth-inscription/plan-page-mon-profil.md`, §3).
 *
 * Trois, parce que le geste légitime se répète : on ne reçoit rien, on
 * regarde dans les indésirables, on redemande. Deux serait déjà frustrant. Une
 * heure, parce que c'est aussi la durée de vie du lien : au-delà, redemander
 * est la seule chose à faire.
 *
 * Ce qu'on borne n'est pas la charge serveur — c'est le nombre de courriels
 * qu'on peut faire tomber dans une boîte. Une adresse noyée rebondit, entre en
 * liste de suppression chez Resend, et le compte devient injoignable pour tous
 * nos autres courriels (CLAUDE.md §0).
 */
export const PasswordLinkThrottleGuard = perAccountThrottleGuard({
  name: "me-password-link",
  limit: 3,
  windowMs: 60 * 60 * 1000,
});
