import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { Invoice } from "../../../domain/entities/invoice.js";
import {
  breakdownOf,
  issueInput,
  line,
} from "../../../domain/entities/__tests__/invoice-fixtures.js";
import {
  InvoiceAssemblyError,
  InvoiceIssuanceBlockedError,
} from "../../../domain/errors/invoice-errors.js";
import { InvoiceNumbering } from "../../../domain/ports/invoice-numbering.js";
import { InvoiceRepository } from "../../../domain/ports/invoice.repository.js";
import { InvoiceNumber } from "../../../domain/value-objects/invoice-number.js";
import {
  SettingSteps,
  StepPublisher,
  StepUnitOfWork,
} from "../../commands/__tests__/mandate-setting-doubles.js";
import { InvoiceIssuer } from "../invoice-issuer.js";

/** Date du fait : comparée à aucune horloge, seulement recopiée. */
const NOW = new Date("2026-10-08T09:00:00.000Z");
const ENTITY = issueInput().seller.legalEntityId;
const ISSUED_ON = issueInput().issuedOn;

class StepNumbering extends InvoiceNumbering {
  private rank = 0;

  constructor(private readonly steps: SettingSteps) {
    super();
  }

  next(legalEntityId: string, issuedOn: string): Promise<InvoiceNumber> {
    this.rank += 1;
    const year = Number(issuedOn.slice(0, 4));
    this.steps.log.push(`number:${legalEntityId}:${String(year)}`);
    return Promise.resolve(InvoiceNumber.compose(year, this.rank));
  }
}

class StepInvoices extends InvoiceRepository {
  readonly inserted: Invoice[] = [];

  constructor(private readonly steps: SettingSteps) {
    super();
  }

  insert(invoice: Invoice): Promise<void> {
    this.steps.log.push(`insert:${invoice.number}`);
    this.inserted.push(invoice);
    return Promise.resolve();
  }

  attachDocument(): Promise<void> {
    this.steps.log.push("attach");
    return Promise.resolve();
  }
}

function harness() {
  const steps = new SettingSteps();
  const invoices = new StepInvoices(steps);
  const events = new StepPublisher(steps);
  const issuer = new InvoiceIssuer(
    new StepNumbering(steps),
    invoices,
    new FixedClock(NOW),
    events,
    new StepUnitOfWork(steps),
  );
  return { steps, invoices, events, issuer };
}

const draft = (number: InvoiceNumber): Invoice => Invoice.issue(issueInput({ number }));

describe("InvoiceIssuer — numéroter, écrire, journaliser en une transaction", () => {
  it("prend le numéro, écrit la pièce et son fait, dans cet ordre et dans l'unité de travail", async () => {
    const h = harness();

    const invoice = await h.issuer.issue({ legalEntityId: ENTITY, issuedOn: ISSUED_ON, draft });

    expect(invoice.number).toBe("FA-2026-000001");
    expect(h.steps.log).toEqual([
      "uow:begin",
      `number:${ENTITY}:2026`,
      "insert:FA-2026-000001",
      "journal:invoice.issued",
      "uow:end",
    ]);
    expect(h.events.traced[0]?.journalFact()).toEqual({
      type: "invoice.issued",
      subjectType: "invoice",
      subjectId: invoice.id,
      occurredAt: NOW,
      payload: {
        subjectLabel: "FA-2026-000001",
        legalEntity: { id: ENTITY, name: invoice.toState().seller.name },
        payer: { id: "c_port", name: "Boulangerie du Port" },
        issuedOn: ISSUED_ON,
        orderCount: 2,
        totalCents: invoice.totalTtcCents,
      },
    });
  });

  it("journalise un avoir sous son propre fait, en citant la facture corrigée", async () => {
    const h = harness();
    const corrected = await h.issuer.issue({ legalEntityId: ENTITY, issuedOn: ISSUED_ON, draft });
    const lines = [line("PAIN", 5.5, 500)];

    await h.issuer.issue({
      legalEntityId: ENTITY,
      issuedOn: ISSUED_ON,
      draft: (number) =>
        Invoice.creditNote({
          id: "cn_1",
          number,
          issuedOn: ISSUED_ON,
          corrected,
          priorCreditNotes: [],
          orders: [],
          lines,
          vat: breakdownOf(lines),
        }),
    });

    expect(h.events.traced[1]?.journalFact()).toMatchObject({
      type: "invoice.credit_note_issued",
      subjectId: "cn_1",
      payload: {
        subjectLabel: "FA-2026-000002",
        correctedInvoice: { id: corrected.id, name: "FA-2026-000001" },
      },
    });
  });

  it("n'écrit rien quand l'agrégat refuse la pièce numérotée", async () => {
    const h = harness();

    await expect(
      h.issuer.issue({
        legalEntityId: ENTITY,
        issuedOn: ISSUED_ON,
        draft: (number) => Invoice.issue(issueInput({ number, buyer: null })),
      }),
    ).rejects.toBeInstanceOf(InvoiceIssuanceBlockedError);
    expect(h.invoices.inserted).toEqual([]);
    expect(h.events.traced).toEqual([]);
  });

  /** Le numéro a été pris pour une séquence : une pièce d'une autre entité ne la consomme pas. */
  it("refuse une pièce d'une autre entité ou d'un autre jour que le numéro pris", async () => {
    const h = harness();

    await expect(
      h.issuer.issue({ legalEntityId: "autre", issuedOn: ISSUED_ON, draft }),
    ).rejects.toBeInstanceOf(InvoiceAssemblyError);
    await expect(
      h.issuer.issue({ legalEntityId: ENTITY, issuedOn: "2026-09-29", draft }),
    ).rejects.toBeInstanceOf(InvoiceAssemblyError);
    expect(h.invoices.inserted).toEqual([]);
  });
});
