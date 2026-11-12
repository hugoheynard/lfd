import type { Clock } from "../../../../platform/time/clock.js";
import type { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import type { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import { companyNamed, type NamedRef } from "../../domain/events/journal-names.js";
import type { CompanyRepository } from "../../domain/ports/company.repository.js";
import type { DocumentStore } from "../../../../platform/storage/document-store.js";
import { ScannedDocument } from "../../../../platform/shared/documents/scanned-document.js";

/** Les ports du dépôt d'un KBIS. */
export interface KbisIngestionPorts {
  readonly store: DocumentStore;
  readonly companies: CompanyRepository;
  readonly events: DomainEventPublisher;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly uow: UnitOfWork;
}

/** Le fichier déposé, pour une société. */
export interface KbisUpload {
  readonly companyId: string;
  readonly fileName: string;
  readonly bytes: Buffer;
}

/**
 * Dépose un KBIS : **valide** le fichier, le **range** dans le stockage objet,
 * puis écrit ses **métadonnées**. Le coeur du dépôt, **sans mur** — l'appelant
 * (membre gestionnaire *ou* staff) a déjà décidé du droit d'agir.
 *
 * Extrait pour être partagé par le chemin **client** (mur membre) et le chemin
 * **staff** (Porte B) : la séquence — et son invariant d'ordre — n'est écrite
 * qu'une fois. Publie la pièce d'activation « KBIS » (journal idempotent par étape).
 *
 * `record` reçoit la société **nommée**, DANS la transaction des métadonnées :
 * l'appelant y trace le dépôt sous son nom du moment et y scelle son
 * intention. Le dépôt, sa trace et l'intention tombent ensemble ; seul le
 * fichier, rangé avant (le stockage n'a pas de transaction), peut rester
 * orphelin d'un dépôt annulé — jamais l'inverse.
 *
 * Chaque dépôt a **sa propre clé** de stockage : un nouvel extrait n'écrase
 * jamais le fichier qu'une certification couvre, et l'extrait certifié reste
 * celui que le staff a lu, même si l'écriture des métadonnées échoue.
 */
export async function ingestKbis(
  upload: KbisUpload,
  ports: KbisIngestionPorts,
  record: (company: NamedRef) => Promise<void>,
): Promise<void> {
  const { companyId } = upload;
  // Le fichier se valide lui-même (PDF par ses octets, taille) avant de partir
  // au stockage : on ne range jamais un fichier douteux.
  const file = ScannedDocument.create(upload.fileName, upload.bytes);

  // Ranger d'abord, écrire les métadonnées ensuite : si le stockage échoue, la
  // base ne pointe pas vers un fichier absent.
  const storageKey = await ports.store.save(kbisKeyFor(companyId, ports.ids.next()), {
    bytes: file.bytes,
    contentType: file.contentType,
  });
  const displayName = await ports.uow.run(async () => {
    const company = await ports.companies.load(companyId);
    if (company === null) {
      throw new CompanyNotFoundError(companyId);
    }
    // Un dépôt neuf n'est jamais certifié : c'est l'agrégat qui le garantit, par
    // construction, et non plus l'adaptateur en remettant quatre colonnes à zéro.
    company.depositKbis({
      storageKey,
      fileName: file.fileName,
      contentType: file.contentType,
      size: file.size,
      uploadedAt: ports.clock.now(),
    });
    await ports.companies.save(company);
    await record(companyNamed(companyId, company));
    return company.displayName();
  });

  ports.events.publish(new CompanyStepReachedEvent(companyId, displayName, "kbis"));
}

/**
 * Clé de stockage du KBIS — ancrée sur l'entreprise, **jamais** sur une entrée
 * client : le mur de tenancy est dans le chemin, et un remplacement écrase à la
 * même clé. Sans extension, depuis que la pièce peut être une photo autant qu'un
 * PDF (le type réel est déduit des octets et gardé en base).
 */
function kbisKeyFor(companyId: string, depositId: string): string {
  return `companies/${companyId}/kbis/${depositId}`;
}
