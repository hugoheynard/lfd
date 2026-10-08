import type { NotifyService } from '../notify.service';
import { saveBlob } from '../shared/download/save-blob';
import type { IssuedInvoicesService } from './issued-invoices.service';

/**
 * **Télécharge le PDF/A-3 Factur-X d'une pièce émise** (plan
 * `plan-emission-de-la-facture.md`, E3b), nommé d'après son numéro — le
 * geste commun de la fiche client et de la pièce en comptabilité. Un échec
 * se dit par une notification ; la pièce reste lisible à l'écran.
 */
export async function downloadIssuedInvoicePdf(
  api: IssuedInvoicesService,
  notify: NotifyService,
  invoice: { readonly invoiceId: string; readonly number: string },
): Promise<void> {
  try {
    saveBlob(await api.document(invoice.invoiceId), `${invoice.number}.pdf`);
  } catch (error) {
    notify.error(
      error,
      `Le PDF de la pièce ${invoice.number} n’a pas pu être téléchargé. Réessayez dans un instant.`,
    );
  }
}
