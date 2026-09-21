/**
 * Le vocabulaire de l'app admin pour une société — **rien que le vocabulaire**.
 *
 * Ce fichier faisait 207 lignes et redéclarait un modèle entier : `AdminCompany`,
 * `CompanyOwner`, `StaffActor`, `Kbis`, `ActivationGate`, `CompanyOpened`… tous
 * en miroir du backend, champ pour champ. Neuf formes qu'aucun compilateur ne
 * rapprochait de leur original.
 *
 * C'est ce genre de miroir qui a fait croire pendant des mois, côté boutique,
 * qu'un rôle de membre valait `company_admin` — une valeur que l'API n'a jamais
 * renvoyée. Ici la même mécanique attendait la même panne.
 *
 * Les formes vivent désormais dans `@lfd/contracts`. L'app garde ses noms : un
 * écran parle de `AdminCompany`, pas de `AdminCompanyView`. Un alias ne peut pas
 * dériver — le compilateur tient les deux bouts —, alors qu'une redéclaration,
 * si.
 */
export type {
  AdminCompanyView as AdminCompany,
  // ⚠️ Le « détail » de cet écran EST la « fiche » du backend : c'est elle qui
  // porte le verdict d'activation (`gate`). `AdminCompanyDetailView`, côté
  // serveur, s'arrête juste avant — la distinction existait, l'app l'ignorait.
  AdminCompanyFicheView as AdminCompanyDetail,
  CompanyOwnerView as CompanyOwner,
  StaffActorView as StaffActor,
  AdminKbisView as Kbis,
  ContactView as PrimaryContact,
  ActivationTraceView as ActivationTrace,
  ActivationGate,
  ActivationCheck,
  ActivationBlocker,
  CompanyOpened,
  HolderAttached,
  HolderOutcome,
  SuspensionCause,
  CompanyStatus,
  DeferredTerm,
} from '@lfd/contracts';

import type { CompanyStatus } from '@lfd/contracts';

/**
 * Libellé FR d'un statut de société.
 *
 * Reste ici, et c'est délibéré : un libellé est de l'ÉCRAN. Le contrat dit
 * quelles valeurs existent, il n'a pas à dire comment on les écrit à
 * l'utilisateur — l'app admin dit « Résilié » là où la boutique dit « Clôturée ».
 */
export const STATUS_LABELS: Readonly<Record<CompanyStatus, string>> = {
  pending: 'En attente',
  active: 'Actif',
  suspended: 'Suspendu',
  terminated: 'Résilié',
};
