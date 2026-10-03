/**
 * Les deux lectures du socle de la composition (CA-D3), en deux ports : le
 * retrait d'un véhicule ne lit que la flotte, l'archivage d'un bac que le
 * catalogue ; seule « Proposer » lit les deux.
 *
 * Des identifiants et non des vues : la règle compte, elle ne décrit pas.
 */

/** Les véhicules EN SERVICE dont les cotes utiles sont renseignées. */
export abstract class MeasuredVehiclesReader {
  abstract measuredIds(): Promise<readonly string[]>;
}

/** Les types de bacs NON archivés. */
export abstract class ActiveBinTypesReader {
  abstract activeIds(): Promise<readonly string[]>;
}
