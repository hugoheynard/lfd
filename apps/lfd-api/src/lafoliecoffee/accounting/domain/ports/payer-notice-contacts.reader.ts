import type { PayerNoticeContacts } from "../services/collection-notice-recipient.js";

/**
 * Les adresses où un avis de prélèvement peut partir, par société payeuse :
 * ses contacts de facturation et son détenteur (décision Hugo, 2026-10-08).
 * Une société absente de la carte n'a ni l'un ni l'autre.
 */
export abstract class PayerNoticeContactsReader {
  abstract contactsOf(
    companyIds: readonly string[],
  ): Promise<ReadonlyMap<string, PayerNoticeContacts>>;
}
