import { KbisStore } from "../../src/account/domain/ports/kbis-store.js";

/**
 * `KbisStore` **factice** pour le seed : le vrai handler d'upload tourne (validation
 * PDF, métadonnées, événement `company.step_reached` kbis), seul le stockage objet
 * (R2/S3, non configuré en dev) est simulé. Rend une clé déterministe, ne lit rien.
 */
export class FakeKbisStore extends KbisStore {
  save(companyId: string): Promise<string> {
    return Promise.resolve(`kbis/seed/${companyId}.pdf`);
  }

  read(): Promise<Buffer> {
    return Promise.resolve(Buffer.from("%PDF-1.4\n%seed\n", "latin1"));
  }
}
