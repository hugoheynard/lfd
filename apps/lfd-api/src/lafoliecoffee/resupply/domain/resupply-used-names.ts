/**
 * **« Quels noms ce point a-t-il déjà donnés à ses réassorts ? »** (lot
 * R1g, Hugo 2026-10-21) — port de lecture à part (ISP) : la saisie propose
 * ces noms, sans liste à administrer. Distincts, les plus récemment employés
 * d'abord, `limit` au plus ; le point est dans la requête.
 */
export abstract class ResupplyUsedNames {
  abstract usedAt(siteId: string, limit: number): Promise<readonly string[]>;
}
