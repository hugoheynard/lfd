import type { CreditorSnapshot } from "../../../../accounting/domain/creditor-snapshot.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CompanyNotFoundForMandateError } from "../../../domain/errors/mandate-errors.js";
import { MandateMentionsMissingError } from "../../../domain/errors/mint-blocker-errors.js";
import type { MandateHolder } from "../../../domain/payment-mandate.repository.js";
import {
  bankAccountWithoutLegalForm,
  CREDITOR,
  FixedCreditors,
  FixedSecrets,
  HOLDER,
  InMemoryBankAccounts,
  InMemoryMandates,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "../../__tests__/payment-doubles.js";
import { RecordingFirstMandateLedger } from "../../__tests__/recording-first-mandate-ledger.js";
import { MintMandateCommand } from "../../commands/mint-mandate.command.js";
import { MintMandateHandler } from "../../commands/mint-mandate.handler.js";
import { GetMandateMintBlockersHandler } from "../get-mandate-mint-blockers.handler.js";
import { GetMandateMintBlockersQuery } from "../get-mandate-mint-blockers.query.js";

// Comparée à aucune horloge : la frappe n'en tire que la date de la RUM.
const NOW = new Date("2026-09-15T09:00:00.000Z");

/** Une société, son RIB et l'émetteur — lus par la lecture ET par la frappe. */
function world(setup: {
  readonly holder?: MandateHolder | null;
  readonly withAccount?: boolean;
  readonly issuer?: CreditorSnapshot | null;
}) {
  const steps = new Steps();
  const mandates = new InMemoryMandates(steps);
  mandates.holder = setup.holder === undefined ? HOLDER : setup.holder;
  const accounts = new InMemoryBankAccounts(steps);
  accounts.stored = (setup.withAccount ?? true) ? bankAccountWithoutLegalForm() : null;
  const creditors = new FixedCreditors(setup.issuer === undefined ? CREDITOR : setup.issuer);
  return {
    read: () =>
      new GetMandateMintBlockersHandler(mandates, accounts, creditors)
        .execute(new GetMandateMintBlockersQuery("cmp_1"))
        .then((view) => view.blockers),
    issuerScheme: () =>
      new GetMandateMintBlockersHandler(mandates, accounts, creditors)
        .execute(new GetMandateMintBlockersQuery("cmp_1"))
        .then((view) => view.issuerScheme),
    mint: () =>
      new MintMandateHandler(
        mandates,
        creditors,
        new FixedClock(NOW),
        new FixedSecrets(),
        accounts,
        new StepPublisher(steps),
        new StepUnitOfWork(steps),
        new RecordingFirstMandateLedger(),
      ).execute(new MintMandateCommand("cmp_1")),
    mandates,
  };
}

describe("GetMandateMintBlockersHandler — ce que la fiche staff annonce", () => {
  /**
   * L'écran RIB staff en déduit que la forme juridique du titulaire est
   * obligatoire : il ne peut la dire facultative quand la frappe l'exige
   * (retour de Hugo, 2026-09-15).
   */
  it.each(["CORE", "B2B"] as const)("rend le schéma de l'émetteur, %s", async (scheme) => {
    await expect(
      world({ issuer: { ...CREDITOR, mandateScheme: scheme } }).issuerScheme(),
    ).resolves.toBe(scheme);
  });

  it("rend un schéma nul sans émetteur", async () => {
    await expect(world({ issuer: null }).issuerScheme()).resolves.toBeNull();
  });

  it("rend les codes de la mention manquante", async () => {
    await expect(world({}).read()).resolves.toEqual(["holder_legal_form_missing"]);
  });

  it("refuse une société inconnue en 404, comme la frappe", async () => {
    await expect(world({ holder: null }).read()).rejects.toBeInstanceOf(
      CompanyNotFoundForMandateError,
    );
  });
});

/**
 * Régression prévenue (plan `plan-mentions-obligatoires-du-mandat.md` §8 #6) :
 * deux calculs — un pour l'écran, un pour la frappe — auraient pu diverger, et
 * un bouton « Frapper » actif sur un refus serveur est le pire des deux écarts.
 */
describe("la frappe et la lecture rendent les mêmes blocages", () => {
  it.each([
    ["B2B, forme juridique du titulaire absente", {}],
    ["B2B, société nue", { holder: { ...HOLDER, companyName: "", siren: "" } }],
    ["sans RIB", { withAccount: false }],
    ["sans émetteur", { issuer: null }],
    [
      "CORE, société nue",
      { holder: { ...HOLDER, siren: "" }, issuer: { ...CREDITOR, mandateScheme: "CORE" as const } },
    ],
  ])("%s", async (_label, setup) => {
    const scene = world(setup);
    const announced = await scene.read();

    const refusal: unknown = await scene.mint().then(
      () => null,
      (error: unknown) => error,
    );

    if (announced.length === 0) {
      expect(refusal).toBeNull();
      expect(scene.mandates.created).toHaveLength(1);
    } else {
      expect(refusal).toBeInstanceOf(MandateMentionsMissingError);
      expect(refusal).toMatchObject({ blockers: announced });
      expect(scene.mandates.created).toHaveLength(0);
    }
  });
});
