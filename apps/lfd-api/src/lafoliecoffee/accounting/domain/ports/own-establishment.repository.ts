import type { OwnEstablishment } from "../entities/own-establishment.js";

/**
 * Port d'ÉCRITURE de nos établissements (plan `plan-prelevement-d-essai.md`,
 * Q1) : il prend et rend l'agrégat. Une société jamais déclarée n'a pas de
 * ligne — `load` rend `null`.
 */
export abstract class OwnEstablishmentRepository {
  abstract load(companyId: string): Promise<OwnEstablishment | null>;
  abstract save(establishment: OwnEstablishment): Promise<void>;
}
