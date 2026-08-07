import type { Lead } from "../entities/lead.js";

/**
 * Port d'**écriture** de l'agrégat Lead (surface séparée de la lecture, cf.
 * `LeadReader` — ISP). Le lead est un vrai agrégat `load/save` : ses invariants
 * (pipeline monotone, terminaux) vivent dans l'entité, jamais ici.
 */
export abstract class LeadRepository {
  /** Persiste un lead saisi (`capture`) et rend son id (ULID préfixé `lead_`). */
  abstract create(lead: Lead): Promise<string>;

  /** Charge l'agrégat à muter, ou `null` s'il n'existe pas. */
  abstract load(leadId: string): Promise<Lead | null>;

  /** Persiste l'état d'un agrégat chargé (statut, notes, rapprochement, contact). */
  abstract save(lead: Lead): Promise<void>;

  /**
   * Le lead **ouvert** (non clos) portant cet e-mail, ou `null`. Clé du
   * **rapprochement** à l'inscription : un seul lead actif rapproché par e-mail.
   */
  abstract findOpenByEmail(email: string): Promise<Lead | null>;
}
