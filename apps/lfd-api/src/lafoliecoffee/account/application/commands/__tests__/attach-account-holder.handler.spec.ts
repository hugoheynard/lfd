import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { Company } from "../../../domain/entities/company.js";
import {
  CompanyAlreadyHasOwnerError,
  CompanyNotFoundError,
  InvalidEmailError,
} from "../../../domain/errors/account-errors.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import { ContactDetails } from "../../../domain/value-objects/contact-details.js";
import { AccountAccessOpener, type AccessOpening } from "../../services/account-access-opener.js";
import type { AccessToGrant } from "../../services/grant-account-access.service.js";
import { AttachAccountHolderCommand } from "../attach-account-holder.command.js";
import { AttachAccountHolderHandler } from "../attach-account-holder.handler.js";

const HOLDER = {
  firstName: "Camille",
  lastName: "Rousseau",
  fonction: "Gérante",
  email: "camille@halles.fr",
  phone: "06 11 22 33 44",
};

/** Ce que l'accès doublé rend : l'issue de l'e-mail, ou l'échec de l'ouverture. */
type Outcome = { readonly mailSent: boolean } | Error;

/** Accès doublé : capture la demande et les annonces, ou échoue pour simuler un canal absent. */
class FakeAccess extends AccountAccessOpener {
  readonly granted: AccessToGrant[] = [];
  /** Combien d'e-mails d'ouverture sont réellement partis. */
  announced = 0;
  constructor(private readonly outcome: Outcome) {
    super();
  }

  open(input: AccessToGrant): Promise<AccessOpening> {
    this.granted.push(input);
    const outcome = this.outcome;
    if (outcome instanceof Error) {
      return Promise.reject(outcome);
    }
    return Promise.resolve({
      userId: "user_1",
      outcome: "identity_created",
      announce: () => {
        this.announced += 1;
        return Promise.resolve(outcome.mailSent);
      },
    });
  }
}

/** Une société **ouverte sur sa seule enseigne** — le cas que ce geste comble. */
function withoutHolder(): Company {
  return Company.reconstitute({
    id: "cmp_1",
    raisonSociale: "",
    enseigne: "Café des Halles",
    formeJuridique: "",
    siret: "",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

interface Doubles {
  readonly handler: AttachAccountHolderHandler;
  readonly access: FakeAccess;
  /** Les sociétés réellement écrites — le témoin de ce qui a été retenu. */
  readonly saved: Company[];
}

function doubles(
  options: { company?: Company | null; access?: Outcome; saveFails?: Error } = {},
): Doubles {
  const saved: Company[] = [];
  // Une société relue à chaque chargement, comme le dépôt réel : un essai raté
  // ne laisse pas au suivant l'agrégat qu'il a muté.
  const companies: CompanyRepository = {
    load: () => Promise.resolve(options.company === undefined ? withoutHolder() : options.company),
    save: (written: Company) => {
      if (options.saveFails !== undefined) {
        return Promise.reject(options.saveFails);
      }
      saved.push(written);
      return Promise.resolve();
    },
    existsBySiret: () => Promise.resolve(false),
    declareOwnedBy: () => Promise.resolve("cmp_owned"),
    declareUnowned: () => Promise.resolve("cmp_unowned"),
    kbisLocation: () => Promise.resolve(null),
  };

  const access = new FakeAccess(options.access ?? { mailSent: true });
  return {
    handler: new AttachAccountHolderHandler(
      companies,
      access,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
      inMemoryIntents(),
    ),
    access,
    saved,
  };
}

function command(): AttachAccountHolderCommand {
  return new AttachAccountHolderCommand("cmp_1", HOLDER, "staff-sub", INTENT);
}

const INTENT = "0b7f6f0e-8a52-4c1e-9d43-0d8e5f0a1b2c";

describe("AttachAccountHolderHandler", () => {
  it("rattache le détenteur et lui ouvre l'accès en propriétaire", async () => {
    const { handler, access, saved } = doubles();

    await expect(handler.execute(command())).resolves.toEqual({ mailSent: true });

    expect(access.granted[0]?.email).toBe("camille@halles.fr");
    // Le rôle ne se choisit pas : celui dont l'adresse ouvre le compte EST le
    // détenteur.
    expect(access.granted[0]?.role).toBe("owner");
    // Le nom d'USAGE dans l'e-mail : la raison sociale est vide ici, et un
    // message sans nom de maison n'aide personne.
    expect(access.granted[0]?.companyName).toBe("Café des Halles");
    expect(saved[0]?.contact?.email.value).toBe("camille@halles.fr");
  });

  it("refuse de remplacer un détenteur en place, sans rien tenter", async () => {
    // En changer est une autre décision, qui mérite son propre geste — et un
    // second propriétaire ne doit pas naître d'un rattachement de rattrapage.
    const taken = withoutHolder();
    taken.attachHolder(ContactDetails.create(HOLDER));
    const { handler, access, saved } = doubles({ company: taken });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(CompanyAlreadyHasOwnerError);
    expect(access.granted).toEqual([]);
    expect(saved).toEqual([]);
  });

  it("n'écrit RIEN quand le fournisseur d'identité tombe", async () => {
    // C'est ce qui rend le geste rejouable : une fiche portant déjà le
    // détenteur ferait refuser la seconde tentative par l'agrégat, et le
    // compte resterait sans accès pour toujours.
    const { handler, saved } = doubles({ access: new Error("canal indisponible") });

    await expect(handler.execute(command())).rejects.toThrow("canal indisponible");
    expect(saved).toEqual([]);
  });

  it("dit quand l'e-mail n'est pas parti, sans défaire le rattachement", async () => {
    const { handler, saved } = doubles({
      access: { mailSent: false },
    });

    await expect(handler.execute(command())).resolves.toEqual({ mailSent: false });
    expect(saved).toHaveLength(1);
  });

  it("refuse une adresse invalide avant tout effet de bord", async () => {
    const { handler, access } = doubles();
    const bad = new AttachAccountHolderCommand(
      "cmp_1",
      { ...HOLDER, email: "" },
      "staff-sub",
      INTENT,
    );

    await expect(handler.execute(bad)).rejects.toBeInstanceOf(InvalidEmailError);
    expect(access.granted).toEqual([]);
  });

  /**
   * Régression (revue de S2, cas 4) : un double clic ouvrait deux fois
   * l'accès et envoyait deux e-mails, la clé de l'e-mail étant tirée au hasard.
   */
  it("un second clic de même intention ne rouvre rien et rend le premier résultat", async () => {
    const { handler, access, saved } = doubles();

    await handler.execute(command());
    await expect(handler.execute(command())).resolves.toEqual({ mailSent: true });

    expect(access.granted).toHaveLength(1);
    expect(access.granted[0]?.intentKey).toBe(INTENT);
    expect(saved).toHaveLength(1);
  });

  it("un échec rend l'intention : le même clic réessaie", async () => {
    const { handler, access } = doubles({ access: new Error("canal indisponible") });

    await expect(handler.execute(command())).rejects.toThrow("canal indisponible");
    await expect(handler.execute(command())).rejects.toThrow("canal indisponible");
    expect(access.granted).toHaveLength(2);
  });

  /**
   * Régression (revue du service d'e-mails, cas 9) : l'e-mail d'ouverture
   * partait avant l'enregistrement de la société, et un refus l'avait déjà envoyé.
   */
  it("un refus à l'enregistrement n'envoie aucun e-mail", async () => {
    const { handler, access } = doubles({ saveFails: new Error("enregistrement refusé") });

    await expect(handler.execute(command())).rejects.toThrow("enregistrement refusé");
    expect(access.announced).toBe(0);
  });

  it("annonce l'accès une seule fois, après l'enregistrement", async () => {
    const { handler, access, saved } = doubles();

    await handler.execute(command());
    expect(saved).toHaveLength(1);
    expect(access.announced).toBe(1);
  });

  it("404 sur une société inconnue", async () => {
    const { handler } = doubles({ company: null });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(CompanyNotFoundError);
  });
});
