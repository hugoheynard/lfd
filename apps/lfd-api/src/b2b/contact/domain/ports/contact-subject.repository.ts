import type { ContactSubject } from "../contact-subject.js";

/**
 * Port d'**écriture** des objets de contact : charger, enregistrer l'objet
 * entier. Le message le lit aussi (`load`) pour savoir si l'objet choisi est
 * proposé à ce public, et pour l'adresse de destination.
 */
export abstract class ContactSubjectRepository {
  /** `null` si l'objet n'existe pas. Un objet archivé est rendu : c'est à lui de dire qu'il n'est plus proposé. */
  abstract load(id: string): Promise<ContactSubject | null>;
  abstract save(subject: ContactSubject): Promise<void>;
}
