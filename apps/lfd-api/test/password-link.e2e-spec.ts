/**
 * E2E de **`POST /me/password-link`** — « changer mon mot de passe », depuis son
 * profil (plan `documentation/auth-inscription/plan-page-mon-profil.md`, §3).
 *
 * Une seule frontière **sortante** est doublée, et c'est celle qui parle à un
 * tenant distant : le fournisseur d'identité. Tout le reste est réel — le
 * guard, le bus, le handler, le vrai SQL du journal. C'est ici, et nulle part
 * ailleurs, que se vérifient les deux choses qui comptent : que la réponse ne
 * porte **aucun lien**, et que le fait atterrit bien en base.
 */
import { AppConfig } from "../src/platform/config/app-config.js";
import { CustomerIdentityPort } from "../src/b2b/account/domain/ports/customer-identity.port.js";
import type {
  IdentityToProvision,
  LoginMethod,
  ProvisionedIdentity,
} from "../src/b2b/account/domain/ports/customer-identity.port.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

const SUB = "auth0|camille";
const EMAIL = "camille@pqmarais.fr";

/** Le lien que le double « émettrait » — il ne doit sortir nulle part. */
const SECRET_LINK = "https://tenant.test/ticket-a-ne-jamais-rendre";

/**
 * Le fournisseur doublé : il tient une liste de méthodes qu'une suite ajuste,
 * et note les envois. Il **n'envoie rien** — c'est l'adaptateur réel qui parle
 * au mailer, et ce n'est pas ce que cette suite éprouve.
 */
class IdentityDouble extends CustomerIdentityPort {
  readonly sent: { subject: string; email: string }[] = [];
  methods: readonly LoginMethod[] = [];

  changeEmail(): Promise<void> {
    return Promise.resolve();
  }
  provision(_input: IdentityToProvision): Promise<ProvisionedIdentity> {
    return Promise.resolve({ subject: SUB, passwordSetupUrl: SECRET_LINK });
  }
  issuePasswordLink(): Promise<string> {
    return Promise.resolve(SECRET_LINK);
  }
  listLoginMethods(): Promise<readonly LoginMethod[]> {
    return Promise.resolve(this.methods);
  }
  linkLoginMethod(): Promise<readonly LoginMethod[]> {
    return Promise.resolve(this.methods);
  }
  unlinkLoginMethod(): Promise<readonly LoginMethod[]> {
    return Promise.resolve(this.methods);
  }
  sendPasswordResetLink(subject: string, email: string): Promise<void> {
    this.sent.push({ subject, email });
    return Promise.resolve();
  }
}

let ctx: E2eContext;
const identity = new IdentityDouble();

/** La connexion **à mot de passe** telle que l'app la connaît, pas une devinette. */
let passwordConnection: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: CustomerIdentityPort, value: identity }] });
  passwordConnection = ctx.app.get(AppConfig).auth0DatabaseConnection();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  identity.sent.length = 0;
  identity.methods = [
    {
      provider: "auth0",
      secondaryUserId: "camille",
      connection: passwordConnection,
      isPrimary: true,
    },
  ];
  await createUser(ctx.prisma, { auth0Sub: SUB, email: EMAIL });
});

/** Les faits du journal pour ce geste, tels que la base les porte. */
async function requestFacts(): Promise<{ type: string; payload: unknown }[]> {
  return ctx.prisma.activityEvent.findMany({
    where: { type: "user.password_reset_requested" },
    orderBy: { id: "asc" },
    select: { type: true, payload: true },
  });
}

describe("POST /me/password-link", () => {
  it("répond 204 avec un corps VIDE — le lien ne sort jamais par HTTP", async () => {
    const response = await ctx.asSub(SUB).post("/me/password-link").expect(204);

    expect(response.text).toBe("");
    expect(JSON.stringify(response.body)).not.toContain("ticket");
    expect(identity.sent).toEqual([{ subject: SUB, email: EMAIL }]);
  });

  it("inscrit la demande au journal, sans adresse ni sujet ni lien", async () => {
    await ctx.asSub(SUB).post("/me/password-link").expect(204);
    await ctx.drain();

    const facts = await requestFacts();
    expect(facts).toEqual([
      { type: "user.password_reset_requested", payload: { subjectLabel: "Camille Durand" } },
    ]);
    const written = JSON.stringify(facts);
    expect(written).not.toContain(EMAIL);
    expect(written).not.toContain("auth0|");
    expect(written).not.toContain("ticket");
  });

  /**
   * Un compte entré par Google n'a pas d'identité à mot de passe. Sans ce
   * refus, Auth0 refuse d'émettre et la chaîne rend un 500 « panne du
   * fournisseur » à quelqu'un dont le compte va parfaitement bien.
   */
  it("refuse en 409 un compte sans connexion par mot de passe, sans rien envoyer", async () => {
    identity.methods = [
      { provider: "google-oauth2", secondaryUserId: "10203040", connection: null, isPrimary: true },
    ];

    const response = await ctx.asSub(SUB).post("/me/password-link").expect(409);

    expect(response.body).toMatchObject({ code: "identity.no_password_login" });
    expect(identity.sent).toEqual([]);
    await ctx.drain();
    expect(await requestFacts()).toEqual([]);
  });

  it("refuse un porteur inconnu", async () => {
    await ctx.http().post("/me/password-link").expect(401);
    expect(identity.sent).toEqual([]);
  });

  /**
   * Le débit est par **compte**, et le seul limiteur du dépôt clé sur l'IP :
   * sans ce second garde, cent appels noieraient une boîte, qui rebondit, entre
   * en liste de suppression chez Resend et rend le compte injoignable pour tous
   * nos autres courriels (CLAUDE.md §0).
   *
   * ⚠️ Le compteur est en mémoire et **partagé par toute la suite** : ce test
   * est le dernier, et il consomme le quota. En ajouter un après lui le ferait
   * échouer sur un 429 qu'il n'attend pas.
   */
  it("borne le nombre de demandes par compte", async () => {
    const quota = 3;
    for (let attempt = 0; attempt < quota; attempt += 1) {
      await ctx.asSub(SUB).post("/me/password-link").expect(204);
    }

    await ctx.asSub(SUB).post("/me/password-link").expect(429);
    expect(identity.sent).toHaveLength(quota);
  });
});
