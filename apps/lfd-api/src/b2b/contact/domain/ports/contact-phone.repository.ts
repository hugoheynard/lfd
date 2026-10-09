import type { ContactPhone } from "../contact-phone.js";

/** Port d'**écriture** des numéros de contact : charger, enregistrer le numéro entier. */
export abstract class ContactPhoneRepository {
  abstract load(id: string): Promise<ContactPhone | null>;
  abstract save(phone: ContactPhone): Promise<void>;
}
