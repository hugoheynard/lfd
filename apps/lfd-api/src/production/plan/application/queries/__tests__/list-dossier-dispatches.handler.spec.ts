import { UNNAMED_EXTERNAL_LABEL } from "../../../domain/entities/dossier-recipient.js";
import { Directory, RecipientsRows, staffCard } from "../../__tests__/dossier-recipient-doubles.js";
import {
  type DossierDispatchTrace,
  DossierDispatchesReader,
} from "../../../domain/ports/dossier-dispatches.reader.js";
import { ListDossierDispatchesHandler } from "../list-dossier-dispatches.handler.js";
import { ListDossierDispatchesQuery } from "../list-dossier-dispatches.query.js";

const DAY = "2026-11-28";
const EVENING = new Date("2026-11-27T18:00:00.000Z");
const NIGHT = new Date("2026-11-27T21:00:00.000Z");

/** Les traces doublées : posées par le test, servies pour le jour demandé. */
class Traces extends DossierDispatchesReader {
  readonly asked: string[] = [];

  constructor(private readonly traces: readonly DossierDispatchTrace[]) {
    super();
  }

  of(serviceDay: string): Promise<readonly DossierDispatchTrace[]> {
    this.asked.push(serviceDay);
    return Promise.resolve(this.traces);
  }
}

/** Les envois du dossier (lot H4, pour H6) : la dernière version reçue par destinataire. */
describe("ListDossierDispatchesHandler", () => {
  it("rend, pour chaque destinataire servable, la dernière version reçue et le dernier envoi", async () => {
    const traces = new Traces([
      { recipientId: "r-paul", outcome: "sent", claimedAt: EVENING, planVersion: 1 },
      { recipientId: "r-paul", outcome: "failed", claimedAt: NIGHT, planVersion: 2 },
      { recipientId: "r-ext", outcome: "sent", claimedAt: NIGHT, planVersion: null },
    ]);
    const handler = new ListDossierDispatchesHandler(
      new RecipientsRows([
        { id: "r-paul", kind: "staff", staffUserId: "s-paul" },
        { id: "r-suspended", kind: "staff", staffUserId: "s-off" },
        {
          id: "r-ext",
          kind: "external",
          email: "chef@ailleurs.fr",
          firstName: "Léa",
          lastName: "Roux",
          jobTitle: null,
        },
        {
          id: "r-new",
          kind: "external",
          email: "new@ailleurs.fr",
          firstName: null,
          lastName: null,
          jobTitle: null,
        },
      ]),
      new Directory()
        .put(staffCard())
        .put(staffCard({ staffUserId: "s-off", email: "off@fournil.fr", active: false })),
      traces,
    );

    const views = await handler.execute(new ListDossierDispatchesQuery(DAY));

    expect(traces.asked).toEqual([DAY]);
    expect(views).toEqual([
      {
        recipientId: "r-paul",
        name: "Paul Martin",
        lastReceived: { at: EVENING.toISOString(), planVersion: 1 },
        lastAttempt: { at: NIGHT.toISOString(), planVersion: 2, outcome: "failed" },
      },
      {
        recipientId: "r-ext",
        name: "Léa Roux",
        lastReceived: { at: NIGHT.toISOString(), planVersion: null },
        lastAttempt: { at: NIGHT.toISOString(), planVersion: null, outcome: "sent" },
      },
      {
        recipientId: "r-new",
        name: UNNAMED_EXTERNAL_LABEL,
        lastReceived: null,
        lastAttempt: null,
      },
    ]);
  });

  it("sans destinataire, ne lit pas les traces", async () => {
    const traces = new Traces([]);

    const views = await new ListDossierDispatchesHandler(
      new RecipientsRows([]),
      new Directory(),
      traces,
    ).execute(new ListDossierDispatchesQuery(DAY));

    expect(views).toEqual([]);
    expect(traces.asked).toEqual([]);
  });
});
