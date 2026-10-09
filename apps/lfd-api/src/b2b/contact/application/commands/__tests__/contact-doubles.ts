import type { ContactMessage } from "../../../domain/contact-message.js";
import type { ContactSubject } from "../../../domain/contact-subject.js";
import { ContactMessageAnonymizer } from "../../../domain/ports/contact-message.anonymizer.js";
import { ContactMessageRepository } from "../../../domain/ports/contact-message.repository.js";
import { ContactSubjectRepository } from "../../../domain/ports/contact-subject.repository.js";
import {
  StaffDirectory,
  type StaffIdentity,
} from "../../../../account/domain/ports/staff-directory.js";

/** Les objets en mémoire, tels que le port d'écriture les rend. */
export class MemorySubjects extends ContactSubjectRepository {
  readonly saved: ContactSubject[] = [];
  private readonly byId = new Map<string, ContactSubject>();

  constructor(...subjects: ContactSubject[]) {
    super();
    for (const subject of subjects) {
      this.byId.set(subject.id, subject);
    }
  }

  load(id: string): Promise<ContactSubject | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  save(subject: ContactSubject): Promise<void> {
    this.byId.set(subject.id, subject);
    this.saved.push(subject);
    return Promise.resolve();
  }
}

/** Les messages en mémoire. */
export class MemoryMessages extends ContactMessageRepository {
  readonly saved: ContactMessage[] = [];
  private readonly byId = new Map<string, ContactMessage>();

  constructor(...messages: ContactMessage[]) {
    super();
    for (const message of messages) {
      this.byId.set(message.id, message);
    }
  }

  load(id: string): Promise<ContactMessage | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  save(message: ContactMessage): Promise<void> {
    this.byId.set(message.id, message);
    this.saved.push(message);
    return Promise.resolve();
  }
}

/** L'annuaire qui connaît (ou pas) l'auteur d'un geste. */
export class Directory extends StaffDirectory {
  constructor(private readonly identity: StaffIdentity | null) {
    super();
  }

  identify(): Promise<StaffIdentity | null> {
    return Promise.resolve(this.identity);
  }
}

/** Un anonymiseur qui rend des lots de tailles données, et note ce qu'on lui demande. */
export class ScriptedAnonymizer extends ContactMessageAnonymizer {
  readonly calls: { readonly before: Date; readonly at: Date; readonly limit: number }[] = [];

  constructor(private readonly batches: number[]) {
    super();
  }

  anonymizeBatchHandledBefore(before: Date, at: Date, limit: number): Promise<number> {
    this.calls.push({ before, at, limit });
    return Promise.resolve(this.batches.shift() ?? 0);
  }
}
