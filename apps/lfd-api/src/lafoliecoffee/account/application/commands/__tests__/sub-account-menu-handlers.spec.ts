import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { InMemoryGestureIntentLedger } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { CompanyStanding } from "../../../../shared/company-standing/domain/company-standing.js";
import type { StandingRole } from "../../../../shared/company-standing/domain/standing-role.js";
import { Company } from "../../../domain/entities/company.js";
import { CompanyNotFoundError } from "../../../domain/errors/account-errors.js";
import { NotASubAccountError } from "../../../domain/errors/hierarchy-errors.js";
import { SubAccountMenuWriterRequiredError } from "../../../domain/errors/sub-account-menu-errors.js";
import { SubAccountMenuSetEvent } from "../../../domain/events/sub-account-menu-acts.event.js";
import { CompanyRepository, type KbisLocation } from "../../../domain/ports/company.repository.js";
import { SubAccountMenuAccessReader } from "../../../domain/ports/sub-account-menu-access.reader.js";
import type { RequestedMenu } from "../../../domain/services/whole-menu.js";
import { HierarchyPlace } from "../../../domain/value-objects/hierarchy-place.js";
import { SubAccountMenuWriting } from "../../services/sub-account-menu-writing.js";
import { SetSubAccountMenuByStaffCommand } from "../set-sub-account-menu-by-staff.command.js";
import { SetSubAccountMenuByStaffHandler } from "../set-sub-account-menu-by-staff.handler.js";
import { SetSubAccountMenuCommand } from "../set-sub-account-menu.command.js";
import { SetSubAccountMenuHandler } from "../set-sub-account-menu.handler.js";
import { InMemoryMenus, InMemorySitesMenus } from "./menu-doubles.js";
import { recordedGestures } from "./site-gesture-doubles.js";

const SITE = "co_site";
const INTENT = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const OTHER_INTENT = "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b";
const NOW = new Date(Date.UTC(2030, 0, 1));

function site(parentCompanyId: string | null): Company {
  return Company.reconstitute({
    id: SITE,
    raisonSociale: "Chalet SAS",
    enseigne: "Chalet du Club",
    formeJuridique: "sas",
    siret: "81245678900021",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "active",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    hierarchy: HierarchyPlace.reconstitute({
      parentCompanyId,
      hasSubAccounts: false,
      groupWithoutDelivery: false,
    }),
  });
}

class OneCompany extends CompanyRepository {
  constructor(private readonly company: Company | null) {
    super();
  }
  existsBySiret(): Promise<boolean> {
    return Promise.resolve(false);
  }
  load(): Promise<Company | null> {
    return Promise.resolve(this.company);
  }
  save(): Promise<void> {
    return Promise.reject(new TypeError("la société ne se réécrit pas pour sa carte"));
  }
  declareOwnedBy(): Promise<string> {
    return Promise.resolve("c");
  }
  declareUnowned(): Promise<string> {
    return Promise.resolve("c");
  }
  kbisLocation(): Promise<KbisLocation | null> {
    return Promise.resolve(null);
  }
}

class FixedStanding extends SubAccountMenuAccessReader {
  constructor(private readonly standing: CompanyStanding | null) {
    super();
  }
  standingOf(): Promise<CompanyStanding | null> {
    return Promise.resolve(this.standing);
  }
}

function standing(own: StandingRole | null, viaRole: StandingRole | null): CompanyStanding {
  return {
    companyStatus: "active",
    own,
    ownAccepted: own !== null,
    via: viaRole === null ? null : { companyId: "co_principal", name: "Club", role: viaRole },
  };
}

const NO_PASTRY: RequestedMenu = {
  mode: "except",
  offMenu: "visible_locked",
  entries: [{ level: "family", ref: "fam_patisserie", effect: "exclude" }],
};

function scene(company: Company | null, place: CompanyStanding | null = null) {
  const menus = new InMemoryMenus();
  const events = new RecordingPublisher();
  const writing = new SubAccountMenuWriting(
    new OneCompany(company),
    menus,
    new InMemorySitesMenus(),
    new FixedIdGenerator("ent"),
    new FixedClock(NOW),
  );
  const uow = new DirectUnitOfWork();
  const gestures = recordedGestures(new Map([[SITE, "co_principal"]]));
  const intents = new OncePerIntent(new InMemoryGestureIntentLedger(), new FixedClock(NOW));
  return {
    menus,
    events,
    durable: gestures.durable,
    principal: new SetSubAccountMenuHandler(
      new FixedStanding(place),
      writing,
      menus,
      events,
      gestures.publisher,
      uow,
    ),
    staff: new SetSubAccountMenuByStaffHandler(
      writing,
      menus,
      events,
      gestures.publisher,
      intents,
      uow,
    ),
  };
}

describe("SetSubAccountMenuHandler — le principal pose la carte d'un site", () => {
  it.each(["owner", "admin"] as const)(
    "le %s du principal la pose, signée de son nom",
    async (role) => {
      const { principal, menus, events } = scene(site("co_principal"), standing(null, role));

      await principal.execute(new SetSubAccountMenuCommand("usr_1", SITE, NO_PASTRY));

      expect(menus.saved).toHaveLength(1);
      expect(menus.saved[0]?.stamp).toEqual({
        author: { kind: "customer", userId: "usr_1" },
        at: NOW,
      });
      expect(events.traced.map((event) => event.journalFact())).toEqual([
        {
          type: "company.sub_account_menu_set",
          subjectType: "company",
          subjectId: SITE,
          payload: {
            subjectLabel: "Chalet du Club",
            mode: "except",
            offMenu: "visible_locked",
            included: 0,
            excluded: 1,
          },
        },
      ]);
    },
  );

  it("écrit le fait du geste, signé du client et non de l'équipe : l'avis ne partira pas (Q3)", async () => {
    const { principal, durable } = scene(site("co_principal"), standing(null, "owner"));

    await principal.execute(new SetSubAccountMenuCommand("usr_1", SITE, NO_PASTRY));

    expect(durable.facts.map((fact) => [fact.type, fact.payload])).toEqual([
      [
        "company.sub_account_menu_set",
        expect.objectContaining({
          siteCompanyId: SITE,
          principalCompanyId: "co_principal",
          authorUserId: "usr_1",
          byTeam: false,
        }),
      ],
    ]);
  });

  it("🔴 le propriétaire PROPRE du site est refusé, et rien n'est écrit", async () => {
    const { principal, menus, events } = scene(site("co_principal"), standing("owner", null));

    await expect(
      principal.execute(new SetSubAccountMenuCommand("usr_1", SITE, NO_PASTRY)),
    ).rejects.toThrow(SubAccountMenuWriterRequiredError);
    expect(menus.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
  });

  it("un `orders` du principal est refusé", async () => {
    const { principal } = scene(site("co_principal"), standing(null, "orders"));
    await expect(
      principal.execute(new SetSubAccountMenuCommand("usr_1", SITE, NO_PASTRY)),
    ).rejects.toThrow(SubAccountMenuWriterRequiredError);
  });

  it("qui n'atteint pas le site reçoit le refus d'une société inconnue", async () => {
    const { principal } = scene(site("co_principal"), null);
    await expect(
      principal.execute(new SetSubAccountMenuCommand("usr_1", SITE, NO_PASTRY)),
    ).rejects.toThrow(CompanyNotFoundError);
  });

  it("rejouée à l'identique, n'écrit ni ne journalise une seconde fois", async () => {
    const { principal, menus, events } = scene(site("co_principal"), standing(null, "admin"));

    await principal.execute(new SetSubAccountMenuCommand("usr_1", SITE, NO_PASTRY));
    await principal.execute(new SetSubAccountMenuCommand("usr_1", SITE, NO_PASTRY));

    expect(menus.saved).toHaveLength(1);
    expect(events.traced).toHaveLength(1);
  });
});

describe("SetSubAccountMenuByStaffHandler — le staff pose la carte depuis la fiche", () => {
  it("la pose signée du staff, et l'événement le dit à ses abonnés", async () => {
    const { staff, menus, events } = scene(site("co_principal"));

    await staff.execute(new SetSubAccountMenuByStaffCommand(SITE, "stf_1", NO_PASTRY, INTENT));

    expect(menus.saved[0]?.stamp.author).toEqual({ kind: "staff", staffId: "stf_1" });
    expect(menus.saved[0]?.entries).toEqual([
      { id: "ent_000001", level: "family", ref: "fam_patisserie", effect: "exclude" },
    ]);
    const [event] = events.traced;
    expect(event).toBeInstanceOf(SubAccountMenuSetEvent);
    expect(event instanceof SubAccountMenuSetEvent ? event.author.kind : null).toBe("staff");
  });

  it("écrit le fait du geste par l'équipe, principal figé : l'avis au principal s'y abonne (Q3)", async () => {
    const { staff, durable } = scene(site("co_principal"));

    await staff.execute(new SetSubAccountMenuByStaffCommand(SITE, "stf_1", NO_PASTRY, INTENT));

    expect(durable.facts.map((fact) => [fact.type, fact.payload])).toEqual([
      [
        "company.sub_account_menu_set",
        expect.objectContaining({
          siteCompanyId: SITE,
          siteName: "Chalet du Club",
          principalCompanyId: "co_principal",
          authorUserId: null,
          byTeam: true,
        }),
      ],
    ]);
  });

  it("un second clic de même intention ne réécrit ni ne réannonce rien", async () => {
    const { staff, menus, durable } = scene(site("co_principal"));
    const command = new SetSubAccountMenuByStaffCommand(SITE, "stf_1", NO_PASTRY, INTENT);

    await staff.execute(command);
    await staff.execute(command);

    expect(menus.saved).toHaveLength(1);
    expect(durable.facts).toHaveLength(1);
  });

  it("la même carte reposée sous une autre intention n'écrit ni n'annonce rien", async () => {
    const { staff, menus, durable } = scene(site("co_principal"));

    await staff.execute(new SetSubAccountMenuByStaffCommand(SITE, "stf_1", NO_PASTRY, INTENT));
    await staff.execute(
      new SetSubAccountMenuByStaffCommand(SITE, "stf_1", NO_PASTRY, OTHER_INTENT),
    );

    expect(menus.saved).toHaveLength(1);
    expect(durable.facts).toHaveLength(1);
  });

  it("refuse une société sans principal", async () => {
    const { staff, menus } = scene(site(null));
    await expect(
      staff.execute(new SetSubAccountMenuByStaffCommand(SITE, "stf_1", NO_PASTRY, INTENT)),
    ).rejects.toThrow(NotASubAccountError);
    expect(menus.saved).toHaveLength(0);
  });

  it("refuse une société inconnue", async () => {
    const { staff } = scene(null);
    await expect(
      staff.execute(new SetSubAccountMenuByStaffCommand(SITE, "stf_1", NO_PASTRY, INTENT)),
    ).rejects.toThrow(CompanyNotFoundError);
  });
});
