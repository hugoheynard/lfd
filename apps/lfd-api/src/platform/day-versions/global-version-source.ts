import type { GlobalVersionSubject, StaffPermission } from "@lfd/contracts";

/**
 * **Une source de numéro global** — un sujet dont le numéro ne dépend d'aucune
 * journée (`plan-veilleur-unique.md`, § 3.1 : la portée `global`).
 *
 * Même figure que {@link DayVersionSource} : `platform` déclare, le bloc qui
 * possède le journal implémente, `appBootstrap/day-version-sources.module.ts`
 * relie. Le droit et la fenêtre vivent avec la source.
 */
export abstract class GlobalVersionSource {
  /** Le nom du sujet sur le fil — un seul fournisseur par nom (le registre y veille). */
  abstract readonly subject: GlobalVersionSubject;

  /** L'une suffit. Jamais vide : une source sans droit serait ouverte à tout le staff. */
  abstract readonly readers: readonly [StaffPermission, ...StaffPermission[]];

  /** La fenêtre pendant laquelle un numéro rangé se sert sans relire la base. */
  abstract readonly freshMs: number;

  /** Le numéro du sujet, `0` si son journal est vide. Opaque : comparé par égalité. */
  abstract versionOf(): Promise<number>;
}
