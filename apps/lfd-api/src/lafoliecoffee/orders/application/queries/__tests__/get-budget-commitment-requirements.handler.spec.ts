import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  OrderingChorusServiceReader,
  type OrderingChorusService,
} from "../../../domain/ports/ordering-chorus-service.reader.js";
import { PayerCommitmentRequirements } from "../../../domain/ports/payer-commitment-requirements.js";
import {
  PRIVATE_PAYER,
  type PayerCommitmentTerms,
} from "../../../domain/services/budget-commitment-rule.js";
import { FixedOrderPayers } from "../../commands/__tests__/payer-doubles.js";
import { GetBudgetCommitmentRequirementsHandler } from "../get-budget-commitment-requirements.handler.js";
import { GetBudgetCommitmentRequirementsQuery } from "../get-budget-commitment-requirements.query.js";

/** L'instant de la lecture n'est comparé qu'à lui-même. */
const NOW = new Date(0);
const ARMY: PayerCommitmentTerms = {
  kind: "public",
  commitmentRequired: true,
  serviceCodeRequired: true,
  defaultServiceCode: "SIRET-PLATEFORME",
};
const UNIT_SHEET: OrderingChorusService = {
  payerCompanyId: "principal",
  serviceCode: "UNITE-TIGNES",
  currentCommitment: { number: "1300012345", endsOn: "2026-12-31" },
};

class Terms extends PayerCommitmentRequirements {
  constructor(private readonly byPayer: ReadonlyMap<string, PayerCommitmentTerms>) {
    super();
  }
  of(payerCompanyId: string): Promise<PayerCommitmentTerms> {
    return Promise.resolve(this.byPayer.get(payerCompanyId) ?? PRIVATE_PAYER);
  }
}

class Sheets extends OrderingChorusServiceReader {
  readonly asked: string[] = [];
  constructor(private readonly byCompany: ReadonlyMap<string, OrderingChorusService>) {
    super();
  }
  of(companyId: string): Promise<OrderingChorusService | null> {
    this.asked.push(companyId);
    return Promise.resolve(this.byCompany.get(companyId) ?? null);
  }
}

/** `unite` suit la facturation de `principal`. */
function unitFollowing(payerId: string): FixedOrderPayers {
  return new FixedOrderPayers(
    new Map([
      [
        "unite",
        {
          companyId: "unite",
          companyName: "Unité",
          groupWithoutDelivery: false,
          billingFollow: { payerId, payerName: payerId, payerStatus: "active" },
          principalId: payerId,
          followsPricing: false,
        },
      ],
    ]),
  );
}

function handler(
  payers: FixedOrderPayers,
  terms: ReadonlyMap<string, PayerCommitmentTerms>,
  sheets: Sheets,
): GetBudgetCommitmentRequirementsHandler {
  return new GetBudgetCommitmentRequirementsHandler(
    payers,
    new Terms(terms),
    sheets,
    new FixedClock(NOW),
  );
}

describe("GetBudgetCommitmentRequirementsHandler", () => {
  it("propose le code et l'engagement de l'unité, avec les exigences du principal", async () => {
    const sheets = new Sheets(new Map([["unite", UNIT_SHEET]]));

    const view = await handler(
      unitFollowing("principal"),
      new Map([["principal", ARMY]]),
      sheets,
    ).execute(new GetBudgetCommitmentRequirementsQuery("unite"));

    expect(sheets.asked).toEqual(["unite"]);
    expect(view).toEqual({
      payerCompanyId: "principal",
      publicPayer: true,
      commitmentRequired: true,
      serviceCodeRequired: true,
      defaultServiceCode: "UNITE-TIGNES",
      currentCommitment: { number: "1300012345", endsOn: "2026-12-31" },
    });
  });

  it("garde le code du payeur quand la fiche de l'unité n'en porte pas", async () => {
    const sheets = new Sheets(new Map([["unite", { ...UNIT_SHEET, serviceCode: "" }]]));

    const view = await handler(
      unitFollowing("principal"),
      new Map([["principal", ARMY]]),
      sheets,
    ).execute(new GetBudgetCommitmentRequirementsQuery("unite"));

    expect(view.defaultServiceCode).toBe("SIRET-PLATEFORME");
    expect(view.currentCommitment?.number).toBe("1300012345");
  });

  it("ignore la fiche posée pour un autre payeur : l'unité a changé de principal", async () => {
    const sheets = new Sheets(new Map([["unite", UNIT_SHEET]]));

    const view = await handler(
      unitFollowing("autre-principal"),
      new Map([["autre-principal", { ...ARMY, defaultServiceCode: "AUTRE" }]]),
      sheets,
    ).execute(new GetBudgetCommitmentRequirementsQuery("unite"));

    expect(view.defaultServiceCode).toBe("AUTRE");
    expect(view.currentCommitment).toBeNull();
  });

  it("sert un engagement sans juger sa date : l'écran la compare à la livraison", async () => {
    const expired = { ...UNIT_SHEET, currentCommitment: { number: "N0", endsOn: "1970-01-01" } };
    const sheets = new Sheets(new Map([["unite", expired]]));

    const view = await handler(
      unitFollowing("principal"),
      new Map([["principal", ARMY]]),
      sheets,
    ).execute(new GetBudgetCommitmentRequirementsQuery("unite"));

    expect(view.currentCommitment).toEqual({ number: "N0", endsOn: "1970-01-01" });
  });

  it("ne lit aucune fiche pour un payeur privé", async () => {
    const sheets = new Sheets(new Map([["unite", UNIT_SHEET]]));

    const view = await handler(unitFollowing("principal"), new Map(), sheets).execute(
      new GetBudgetCommitmentRequirementsQuery("unite"),
    );

    expect(view).toMatchObject({ publicPayer: false, currentCommitment: null });
    expect(sheets.asked).toEqual([]);
  });

  it("rend une vue vide sans société", async () => {
    const view = await handler(
      unitFollowing("principal"),
      new Map(),
      new Sheets(new Map()),
    ).execute(new GetBudgetCommitmentRequirementsQuery(null));

    expect(view).toEqual({
      payerCompanyId: null,
      publicPayer: false,
      commitmentRequired: false,
      serviceCodeRequired: false,
      defaultServiceCode: "",
      currentCommitment: null,
    });
  });
});
