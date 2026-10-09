import type { ContactSubjectPayload } from "@lfd/contracts";

import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ContactSubjectNotFoundError } from "../../../domain/errors/contact-errors.js";
import { ArchiveContactSubjectCommand } from "../archive-contact-subject.command.js";
import { ArchiveContactSubjectHandler } from "../archive-contact-subject.handler.js";
import { CreateContactSubjectCommand } from "../create-contact-subject.command.js";
import { CreateContactSubjectHandler } from "../create-contact-subject.handler.js";
import { ReviseContactSubjectCommand } from "../revise-contact-subject.command.js";
import { ReviseContactSubjectHandler } from "../revise-contact-subject.handler.js";
import { MemorySubjects } from "./contact-doubles.js";

const AT = new Date(0);
const PAYLOAD: ContactSubjectPayload = {
  label: { fr: "Une commande", en: "An order", it: "Un ordine" },
  recipientEmail: "commandes@lfc.fr",
  position: 2,
  active: true,
  audience: "both",
  priority: "medium",
};

describe("les objets de contact — créer, réviser, archiver", () => {
  it("crée un objet avec l'id du générateur, et le rend", async () => {
    const subjects = new MemorySubjects();
    const id = await new CreateContactSubjectHandler(
      subjects,
      new FixedIdGenerator("subj"),
      new FixedClock(AT),
    ).execute(new CreateContactSubjectCommand(PAYLOAD));
    expect(id).toBe("subj_000001");
    expect(subjects.saved[0]?.labelFr).toBe("Une commande");
  });

  it("révise puis archive l'objet chargé", async () => {
    const subjects = new MemorySubjects();
    const id = await new CreateContactSubjectHandler(
      subjects,
      new FixedIdGenerator("subj"),
      new FixedClock(AT),
    ).execute(new CreateContactSubjectCommand(PAYLOAD));

    await new ReviseContactSubjectHandler(subjects, new FixedClock(AT)).execute(
      new ReviseContactSubjectCommand(id, { ...PAYLOAD, audience: "b2c" }),
    );
    await new ArchiveContactSubjectHandler(subjects, new FixedClock(AT)).execute(
      new ArchiveContactSubjectCommand(id),
    );
    const state = subjects.saved.at(-1)?.toPersistence();
    expect(state).toMatchObject({ audience: "b2c", archivedAt: AT });
  });

  it("refuse de réviser ou d'archiver un objet inconnu", async () => {
    const subjects = new MemorySubjects();
    await expect(
      new ReviseContactSubjectHandler(subjects, new FixedClock(AT)).execute(
        new ReviseContactSubjectCommand("nope", PAYLOAD),
      ),
    ).rejects.toThrow(ContactSubjectNotFoundError);
    await expect(
      new ArchiveContactSubjectHandler(subjects, new FixedClock(AT)).execute(
        new ArchiveContactSubjectCommand("nope"),
      ),
    ).rejects.toThrow(ContactSubjectNotFoundError);
  });
});
