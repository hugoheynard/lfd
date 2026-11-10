/**
 * **L'interrupteur des avis d'un principal — lecture**
 * (`plan-notifications-sous-comptes.md`, « Interrupteur bâti »). Pas de ligne
 * = désactivé (décision de Hugo, 2026-10-20). Port à part de son écriture
 * (ISP) : l'envoi ne fait que le lire.
 */
export abstract class SubAccountNoticeSwitchReader {
  /** `false` tant que le staff n'a pas activé les avis de ce principal. */
  abstract isEnabled(principalId: string): Promise<boolean>;
}

/**
 * **L'interrupteur des avis d'un principal — écriture.** Un réglage sans
 * transition ni invariant : pas d'agrégat (CLAUDE.md §3.1).
 */
export abstract class SubAccountNoticeSwitchWriter {
  /** `staffId` : l'id de fiche du staff qui bascule. */
  abstract set(principalId: string, enabled: boolean, staffId: string, at: Date): Promise<void>;
}
