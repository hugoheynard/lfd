import {
  StaffContacts,
  type StaffContact,
} from "../../../../staff/directory/domain/staff-contacts.js";
import {
  MailCopyAdminReader,
  type MailCopyPublicationState,
} from "../../domain/ports/mail-copy-admin.reader.js";
import { MailCopyReleaseRepository } from "../../domain/ports/mail-copy-release.repository.js";
import { MailCopyRepository } from "../../domain/ports/mail-copy.repository.js";
import {
  MailSpecimenRenderer,
  MailTrialSender,
  type MailSpecimenRendering,
} from "../../domain/ports/mail-specimen.renderer.js";
import { PublishedMailCopyCache } from "../../domain/ports/published-mail-copy.cache.js";
import { MailCopyEntry, type MailCopyEntryState } from "../../domain/mail-copy-entry.js";
import {
  MailCopyChangedError,
  MailCopyPublishedMeanwhileError,
} from "../../domain/mail-copy-errors.js";
import type { MailCopyLocale } from "../../domain/mail-copy-locale.js";
import { MailCopyRelease } from "../../domain/mail-copy-release.js";
import type { MailTextsByMail } from "../../domain/mail-copy-texts.js";

const idOf = (mail: string, path: string, locale: string): string => `${mail}|${path}|${locale}`;

/**
 * Les textes en mémoire, avec le MÊME verrou que l'adaptateur : l'écriture est
 * conditionnée à la révision chargée.
 */
export class InMemoryMailCopy extends MailCopyRepository {
  readonly rows = new Map<string, MailCopyEntryState>();
  version = 0;

  load(mail: string, path: string, locale: MailCopyLocale): Promise<MailCopyEntry> {
    const state = this.rows.get(idOf(mail, path, locale));
    return Promise.resolve(
      state === undefined
        ? MailCopyEntry.untouched(mail, path, locale)
        : MailCopyEntry.reconstitute(state),
    );
  }

  save(entry: MailCopyEntry): Promise<void> {
    const state = entry.snapshot();
    const id = idOf(state.mail, state.path, state.locale);
    if ((this.rows.get(id)?.revision ?? 0) !== state.revision - 1) {
      return Promise.reject(new MailCopyChangedError(state.mail, state.path, state.locale));
    }
    this.rows.set(id, state);
    return Promise.resolve();
  }

  state(mail: string, path: string, locale: MailCopyLocale): MailCopyEntryState | undefined {
    return this.rows.get(idOf(mail, path, locale));
  }
}

/** Le port de « Publier », sur le même état que {@link InMemoryMailCopy}. */
export class InMemoryReleases extends MailCopyReleaseRepository {
  raceVersion = false;

  constructor(private readonly texts: InMemoryMailCopy) {
    super();
  }

  load(): Promise<MailCopyRelease> {
    const pending = [...this.texts.rows.values()]
      .filter((state) => state.draft.state !== "unchanged")
      .map((state) => MailCopyEntry.reconstitute(state));
    return Promise.resolve(MailCopyRelease.of(this.texts.version, pending));
  }

  save(release: MailCopyRelease): Promise<void> {
    if (this.raceVersion || this.texts.version !== release.expectedVersion) {
      return Promise.reject(new MailCopyPublishedMeanwhileError());
    }
    this.texts.version = release.version;
    for (const entry of release.entries) {
      const state = entry.snapshot();
      this.texts.rows.set(idOf(state.mail, state.path, state.locale), state);
    }
    return Promise.resolve();
  }
}

/** La lecture de l'éditeur, sur le même état. */
export class InMemoryAdminReader extends MailCopyAdminReader {
  constructor(private readonly texts: InMemoryMailCopy) {
    super();
  }

  entries(): Promise<readonly MailCopyEntryState[]> {
    return Promise.resolve([...this.texts.rows.values()]);
  }

  publication(): Promise<MailCopyPublicationState> {
    return Promise.resolve({ version: this.texts.version, publishedAt: null, publishedBy: null });
  }
}

/** Un cache qui se souvient d'avoir été oublié. */
export class RecordingCache extends PublishedMailCopyCache {
  forgotten = 0;
  forget(): void {
    this.forgotten += 1;
  }
}

/** Un rendu qui écrit, en guise d'objet, les textes qu'il a reçus. */
export class RecordingRenderer extends MailSpecimenRenderer {
  readonly calls: { mail: string; locale: MailCopyLocale; texts: MailTextsByMail }[] = [];

  render(mail: string, locale: MailCopyLocale, texts: MailTextsByMail): MailSpecimenRendering {
    this.calls.push({ mail, locale, texts });
    return { subject: JSON.stringify(texts), html: "<p>exemple</p>", attachments: [] };
  }
}

/** Un envoi d'essai qui garde ce qu'on lui demande, et peut échouer. */
export class RecordingTrialSender extends MailTrialSender {
  readonly sent: { to: string; mail: string; locale: MailCopyLocale; texts: MailTextsByMail }[] =
    [];
  failure: Error | null = null;

  send(to: string, mail: string, locale: MailCopyLocale, texts: MailTextsByMail): Promise<void> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    this.sent.push({ to, mail, locale, texts });
    return Promise.resolve();
  }
}

/** L'annuaire, réduit aux fiches qu'on lui donne. */
export class FixedStaffContacts extends StaffContacts {
  constructor(private readonly contacts: readonly StaffContact[]) {
    super();
  }

  contactsOf(staffUserIds: readonly string[]): Promise<ReadonlyMap<string, StaffContact>> {
    return Promise.resolve(
      new Map(
        this.contacts
          .filter((contact) => staffUserIds.includes(contact.staffUserId))
          .map((contact) => [contact.staffUserId, contact]),
      ),
    );
  }
}
