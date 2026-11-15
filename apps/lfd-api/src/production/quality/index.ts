/**
 * La porte de la qualité (`quality/`) : ce que les autres métiers du fournil
 * lisent du contrôle qualité. Tout le reste de `quality/` est privé (on y entre par cet
 * index, qui ne fait que réexporter : `documentation/fournil/architecture-contexte-production.md`, « Les règles de la surface » ; porte
 * `lint:production-subcontexts`).
 *
 * On ne rend public que ce que les autres utilisent réellement : la fiche
 * d'atelier lit les pastilles qualité de ses lignes par ce port. Les racines
 * de composition (`production.module.ts`, `appBootstrap/`) relient les
 * adaptateurs concrets en direct.
 *
 * Ce fichier ne fait que réexporter, et rien de ce qu'il réexporte ne charge
 * un autre métier : un cycle d'imports à travers un `index.ts` rend une
 * classe `undefined` quand Nest lit ses métadonnées.
 */
export { QualityLineStatusReader } from "./domain/ports/quality-line-status.reader.js";
