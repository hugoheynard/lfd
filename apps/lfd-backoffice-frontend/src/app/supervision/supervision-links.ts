import type { StaffPermission, StaffRole } from '@lfd/contracts';

/**
 * **Les renvois de la Supervision** — ce qui remplace chaque geste de la
 * maquette (plan §1). La Supervision n'agit pas : elle envoie vers l'écran qui
 * opère, et le libellé dit ce qu'on va y faire, jamais le geste.
 *
 * Les cibles sont des LISTES : `colisage/:reference` est en `write`, et un
 * renvoi qui pointerait dessus mènerait vers un refus.
 */
export const SUPERVISION_LINKS = {
  preparation: { path: '/production/journee', label: 'Ouvrir la fournée' },
  packing: { path: '/production/colisage', label: 'Ouvrir le colisage' },
  handover: { path: '/comptoir/retrait', label: 'Ouvrir le retrait' },
} as const;

export type SupervisionColumn = keyof typeof SUPERVISION_LINKS;

/**
 * Le droit qui ouvre les trois cibles : la garde héritée des coquilles
 * `production` et `comptoir`, leurs routes enfants déclarant `null`. Un test
 * (`supervision-links.spec.ts`) confronte chaque renvoi à la garde EFFECTIVE de
 * sa cible dans la table de routes — un droit propre à la Production
 * (TODO `todo-comptoir-statuts-et-droit-production.md`) le fera rougir.
 */
export const LINK_PERMISSION: StaffPermission = 'b2b_orders:read';

/**
 * **L'onglet d'arrivée en mobile, choisi par le rôle** — pas par le dernier
 * ouvert (SPEC §6). Le vendeur du comptoir arrive sur le retrait ; tous les
 * autres sur la préparation, par défaut. Aucun rôle « fournil » n'existe
 * aujourd'hui (vérifié le 2026-09-25 dans `staffRoleSchema`).
 */
const LANDING_BY_ROLE: Readonly<Partial<Record<StaffRole, SupervisionColumn>>> = {
  comptoir: 'handover',
};

export function landingColumnOf(role: StaffRole | null): SupervisionColumn {
  return (role === null ? undefined : LANDING_BY_ROLE[role]) ?? 'preparation';
}
