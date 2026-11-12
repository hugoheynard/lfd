import { CustomerIdentityPort } from "../../src/lafoliecoffee/account/domain/ports/customer-identity.port.js";
import type {
  LoginMethod,
  ProvisionedIdentity,
} from "../../src/lafoliecoffee/account/domain/ports/customer-identity.port.js";
import { StaffIdentityPort } from "../../src/staff/invitations/staff-identity.port.js";
import { CardProviders } from "../../src/card-payment/domain/ports/card-providers.js";
import { CheckoutGateway } from "../../src/lafoliecoffee/payments/domain/ports/checkout-gateway.js";
import { OrderMailOrigins } from "../../src/lafoliecoffee/orders/domain/ports/order-mail-origins.js";
import { AdminTokenVerifier } from "../../src/platform/auth/admin-token.verifier.js";
import { VerifiedSendingDomains } from "../../src/mail/senders/domain/ports/verified-sending-domains.js";
import { POST_DEPLOY_OPERATIONS } from "../../src/platform/post-deploy/post-deploy-operation.js";
import { MAILER } from "../../src/mail/templates/mailer.tokens.js";
import { Clock } from "../../src/platform/time/clock.js";
import { FixedClock } from "../../src/platform/time/fixed-clock.js";
import type { E2eOverride } from "../e2e-harness.js";
import { cardGatewayDouble } from "../order-factory.js";
import { REPLAY_POST_DEPLOY_OPERATIONS } from "./ops-scenarios.js";

/**
 * Les frontières sortantes que l'e2e du rejeu double — celles des suites
 * voisines, réunies : chaque scénario y trouve la même application.
 */

/** Le jeton porteur EST le `sub` : un staff semé se reconnaît par son `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const recordingMailer = {
  enabled: true,
  send: (): Promise<{ providerId: null }> => Promise.resolve({ providerId: null }),
};

let sessionCounter = 0;
/** Une session de paiement neuve par appel : un second appel se verrait. */
const fakeCheckout = {
  createCheckoutSession: () => {
    sessionCounter += 1;
    const sessionId = `cs_replay_${String(sessionCounter)}`;
    return Promise.resolve({ sessionId, url: `https://checkout.stripe.test/${sessionId}` });
  },
  expireCheckoutSession: (): Promise<void> => Promise.resolve(),
};

const origins = {
  clientBaseUrl: () => "https://app.lfc.test",
  adminBaseUrl: () => "https://admin.lfc.test",
};

/** Les domaines d'envoi vérifiés chez Resend, doublés. */
class FixedDomains extends VerifiedSendingDomains {
  verified(): Promise<readonly string[]> {
    return Promise.resolve(["lafoliecoffee.info", "lfd-backoffice.test"]);
  }
}

/**
 * Le fournisseur d'identité des clients, doublé : un lien, des méthodes de
 * connexion qu'un scénario pose, aucun envoi.
 */
class CustomerIdentityDouble extends CustomerIdentityPort {
  methods: readonly LoginMethod[] = [];

  changeEmail(): Promise<void> {
    return Promise.resolve();
  }
  provision(): Promise<ProvisionedIdentity> {
    return Promise.resolve({
      subject: "auth0|replay-provisioned",
      passwordSetupUrl: "https://t.test/neuf",
    });
  }
  issuePasswordLink(): Promise<string> {
    return Promise.resolve("https://t.test/lien");
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
  sendPasswordResetLink(): Promise<void> {
    return Promise.resolve();
  }
}

/** Le fournisseur d'identité des clients, doublé ; remis à vide avant chaque scénario. */
export const customerIdentity = new CustomerIdentityDouble();

/** Le fournisseur d'identité du staff, doublé : un `sub` par adresse, un lien. */
const staffIdentity = {
  provision: (input: { email: string }): Promise<{ subject: string; passwordSetupUrl: string }> =>
    Promise.resolve({ subject: `auth0|${input.email}`, passwordSetupUrl: "https://t.test/s" }),
  issuePasswordLink: (): Promise<string> => Promise.resolve("https://t.test/s-lien"),
};

/** Le prestataire de carte doublé. */
export const cards = cardGatewayDouble("pi_replay");

/** L'horloge de la suite, remise à maintenant avant chaque scénario. */
export const clock = new FixedClock(new Date());

export const REPLAY_OVERRIDES: readonly E2eOverride[] = [
  { token: AdminTokenVerifier, value: stubAdminVerifier },
  { token: MAILER, value: recordingMailer },
  { token: CardProviders, value: cards },
  { token: CheckoutGateway, value: fakeCheckout },
  { token: OrderMailOrigins, value: origins },
  { token: VerifiedSendingDomains, value: new FixedDomains() },
  { token: CustomerIdentityPort, value: customerIdentity },
  { token: StaffIdentityPort, value: staffIdentity },
  { token: Clock, value: clock },
  { token: POST_DEPLOY_OPERATIONS, value: REPLAY_POST_DEPLOY_OPERATIONS },
];
