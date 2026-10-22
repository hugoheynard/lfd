import type { CustomerAccessRowView } from "@lfd/contracts";

export type { CustomerAccessRowView };

/**
 * La vue d'ensemble des accès clients : **toutes** les sociétés, principales et
 * sous-comptes, avec leur détenteur et l'état de son accès.
 *
 * Cross-tenant, comme la liste des comptes clients : c'est une lecture staff,
 * l'auth staff garde la route en amont.
 *
 * Un port à part de `PendingAccessReader` (ISP) : la file des accès à remettre
 * ne lit que les personnes `invited` et sert à fabriquer un lien ; celle-ci lit
 * les sociétés, y compris celles qui n'ont personne, et ne fabrique rien.
 */
export abstract class CustomerAccessOverviewReader {
  abstract list(): Promise<readonly CustomerAccessRowView[]>;
}
