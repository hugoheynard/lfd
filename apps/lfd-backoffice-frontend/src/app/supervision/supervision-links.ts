import type { StaffPermission } from '@lfd/contracts';

/**
 * **Les renvois de la Supervision** — ce qui remplace chaque geste de la
 * maquette (plan §1). La Supervision n'agit pas : elle envoie vers l'écran qui
 * opère, et le libellé dit ce qu'on va y faire, jamais le geste.
 *
 * Les cibles sont des LISTES : `colisage/:reference` est en `write`, et un
 * renvoi qui pointerait dessus mènerait vers un refus.
 */
export const SUPERVISION_LINKS = {
  preparation: { path: '/fournil', label: 'Ouvrir la fournée' },
  packing: { path: '/colisage', label: 'Ouvrir le colisage' },
  handover: { path: '/comptoir/retrait', label: 'Ouvrir le retrait' },
} as const;

export type SupervisionColumn = keyof typeof SUPERVISION_LINKS;

/**
 * Le droit qui ouvre CHAQUE cible — la garde de sa vue. Un seul droit les
 * ouvrait toutes (`b2b_orders:read`, la garde des coquilles) jusqu'au
 * 2026-10-01 ; chaque geste a désormais le sien
 * (`documentation/livraisons/droits/plan-droits-par-geste.md`, 5.1). Un test (`supervision-links.spec.ts`)
 * confronte chaque renvoi à la garde EFFECTIVE de sa cible dans la table de
 * routes.
 */
export const LINK_PERMISSIONS: Readonly<Record<SupervisionColumn, StaffPermission>> = {
  preparation: 'production_worksheet:read',
  packing: 'production_packing:read',
  handover: 'handover_counter:read',
};

/**
 * **L'onglet d'arrivée en mobile, choisi par le rôle** — pas par le dernier
 * ouvert (SPEC §6). Le vendeur du comptoir arrive sur le retrait ; tous les
 * autres sur la préparation, par défaut. Aucun rôle « fournil » n'existe
 * aujourd'hui (vérifié le 2026-09-25 dans `staffRoleSchema`).
 */
const LANDING_BY_ROLE: ReadonlyMap<string, SupervisionColumn> = new Map([['comptoir', 'handover']]);

/**
 * `role` est une CLÉ de rôle, plus l'union `StaffRole` : un rôle créé à l'écran
 * arrive ici aussi (plan `plan-roles-lus-en-base.md` §3.5), et tombe sur le
 * défaut.
 */
export function landingColumnOf(role: string | null): SupervisionColumn {
  return (role === null ? undefined : LANDING_BY_ROLE.get(role)) ?? 'preparation';
}
