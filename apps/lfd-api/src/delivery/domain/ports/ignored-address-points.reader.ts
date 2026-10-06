import type { IgnoredPoint } from "../services/address-point-suggestions.js";

/**
 * Port de **lecture** des suggestions ignorées qui tiennent encore (§6) :
 * leur point n'a pas été effacé par la purge des positions. Une interface à
 * part de l'écriture (ISP).
 */
export abstract class IgnoredAddressPointsReader {
  abstract ignored(): Promise<readonly IgnoredPoint[]>;
}
