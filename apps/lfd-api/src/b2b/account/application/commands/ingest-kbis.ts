import type { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import type { CompanyRepository } from "../../domain/ports/company.repository.js";
import type { DocumentStore } from "../../../../platform/storage/document-store.js";
import { ScannedDocument } from "../../../../platform/shared/documents/scanned-document.js";

/**
 * Dépose un KBIS : **valide** le fichier, le **range** dans le stockage objet,
 * puis écrit ses **métadonnées**. Le coeur du dépôt, **sans mur** — l'appelant
 * (membre gestionnaire *ou* staff) a déjà décidé du droit d'agir.
 *
 * Extrait pour être partagé par le chemin **client** (mur membre) et le chemin
 * **staff** (Porte B) : la séquence — et son invariant d'ordre — n'est écrite
 * qu'une fois. Publie la pièce d'activation « KBIS » (journal idempotent par étape).
 */
export async function ingestKbis(
  companyId: string,
  fileName: string,
  bytes: Buffer,
  store: DocumentStore,
  companies: CompanyRepository,
  events: DomainEventPublisher,
): Promise<void> {
  // Le fichier se valide lui-même (PDF par ses octets, taille) avant de partir
  // au stockage : on ne range jamais un fichier douteux.
  const file = ScannedDocument.create(fileName, bytes);

  // Ranger d'abord, écrire les métadonnées ensuite : si le stockage échoue, la
  // base ne pointe pas vers un fichier absent.
  const storageKey = await store.save(kbisKeyFor(companyId), {
    bytes: file.bytes,
    contentType: file.contentType,
  });
  await companies.saveKbisMetadata(companyId, {
    storageKey,
    fileName: file.fileName,
    contentType: file.contentType,
    size: file.size,
  });

  events.publish(new CompanyStepReachedEvent(companyId, "kbis"));
}

/**
 * Clé de stockage du KBIS — ancrée sur l'entreprise, **jamais** sur une entrée
 * client : le mur de tenancy est dans le chemin, et un remplacement écrase à la
 * même clé. Sans extension, depuis que la pièce peut être une photo autant qu'un
 * PDF (le type réel est déduit des octets et gardé en base).
 */
function kbisKeyFor(companyId: string): string {
  return `companies/${companyId}/kbis`;
}
