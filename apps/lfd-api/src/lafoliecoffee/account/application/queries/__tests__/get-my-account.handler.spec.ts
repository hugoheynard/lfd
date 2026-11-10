import type { FeatureLevelsView } from "@lfd/contracts";

import { UserProfileNotFoundError } from "../../../domain/errors/account-errors.js";
import {
  AccountFeatureLevelsReader,
  type FeatureLevelsSubject,
} from "../../../domain/ports/account-feature-levels.reader.js";
import { AccountReader, type StoredAccountView } from "../../../domain/ports/account.reader.js";
import { parseNavPreferences } from "../../../domain/value-objects/nav-preferences.js";
import { GetMyAccountHandler } from "../get-my-account.handler.js";
import { GetMyAccountQuery } from "../get-my-account.query.js";

const USER_ID = "user_1";
const SUBJECT: FeatureLevelsSubject = { email: "lea@exemple.fr", emailProven: true };
const LEVELS: FeatureLevelsView = {
  customerMandate: "open",
  facebookLogin: "hidden",
  proSignupCallback: "hidden",
};

const stored: StoredAccountView = {
  profile: {
    userId: USER_ID,
    firstName: "Léa",
    lastName: "Martin",
    email: "lea@exemple.fr",
    phone: "",
  },
  companies: [],
  reachableSites: [],
  navPrefs: parseNavPreferences(null),
};

/** Un compte en mémoire, qui note quand on le lit et quand il répond. */
class StubAccounts extends AccountReader {
  constructor(
    private readonly account: StoredAccountView | null,
    private readonly events: string[],
  ) {
    super();
  }

  async read(userId: string): Promise<StoredAccountView | null> {
    this.events.push(`account:start:${userId}`);
    await Promise.resolve();
    this.events.push("account:end");
    return this.account;
  }
}

class StubLevels extends AccountFeatureLevelsReader {
  readonly subjects: FeatureLevelsSubject[] = [];

  constructor(private readonly events: string[]) {
    super();
  }

  async levelsFor(subject: FeatureLevelsSubject): Promise<FeatureLevelsView> {
    this.subjects.push(subject);
    this.events.push("levels:start");
    await Promise.resolve();
    this.events.push("levels:end");
    return LEVELS;
  }
}

describe("GetMyAccountHandler", () => {
  it("rend le compte et les niveaux de la personne en une réponse", async () => {
    const events: string[] = [];
    const levels = new StubLevels(events);
    const handler = new GetMyAccountHandler(new StubAccounts(stored, events), levels);

    await expect(handler.execute(new GetMyAccountQuery(USER_ID, SUBJECT))).resolves.toEqual({
      ...stored,
      featureLevels: LEVELS,
    });
    expect(levels.subjects).toEqual([SUBJECT]);
  });

  /** Les niveaux n'attendent pas le compte : les deux lectures partent ensemble. */
  it("lance les deux lectures avant qu'aucune ne réponde", async () => {
    const events: string[] = [];
    const handler = new GetMyAccountHandler(
      new StubAccounts(stored, events),
      new StubLevels(events),
    );

    await handler.execute(new GetMyAccountQuery(USER_ID, SUBJECT));

    expect(events.slice(0, 2)).toEqual([`account:start:${USER_ID}`, "levels:start"]);
  });

  it("refuse une personne disparue entre la garde et la lecture", async () => {
    const events: string[] = [];
    const handler = new GetMyAccountHandler(new StubAccounts(null, events), new StubLevels(events));

    await expect(handler.execute(new GetMyAccountQuery(USER_ID, SUBJECT))).rejects.toBeInstanceOf(
      UserProfileNotFoundError,
    );
  });
});
