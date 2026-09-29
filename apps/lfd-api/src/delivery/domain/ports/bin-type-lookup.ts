import type { BinType } from "../entities/bin-type.js";

/**
 * Port de **lecture** étroit du catalogue des bacs, pour DÉCLARER un bac
 * (lot 4 bis, tranche B) : le type se relit en agrégat, parce que c'est lui
 * qui sait s'il est en service et cloisonnable. La déclaration n'écrit jamais
 * le catalogue — d'où ce port, plutôt que `BinTypeRepository` entier (ISP).
 * Relié à l'adaptateur des types (`useExisting`).
 */
export abstract class BinTypeLookup {
  abstract load(id: string): Promise<BinType | null>;
}
