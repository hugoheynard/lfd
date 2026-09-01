import type { StaffRoleView } from "@lfd/contracts";

/**
 * Port de **lecture** des rôles — ce que l'écran consomme.
 *
 * Séparé du dépôt (ISP), et la séparation porte une garantie : ce port rend des
 * **vues**, jamais l'agrégat. Un écran qui recevrait l'agrégat pourrait appeler
 * `redefine()` sur un objet qu'il ne possède pas.
 *
 * La liste inclut `superadmin`, qui n'a pourtant aucune ligne en base : il est
 * **synthétisé** par l'adaptateur. Le montrer est tout le point de l'écran — on
 * doit pouvoir constater qu'un sommet existe, et voir qu'il ne se modifie pas.
 */
export abstract class StaffRoleReader {
  /** Tous les rôles, archivés compris, `superadmin` en tête. */
  abstract list(): Promise<readonly StaffRoleView[]>;
}
