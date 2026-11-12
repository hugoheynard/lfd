/**
 * Les routes « par intention » que l'e2e du rejeu ne rejoue pas encore, faute
 * de scénario semé (`write-replay.e2e-spec.ts`). Une dette COMPTÉE, qui ne
 * peut que décroître : une route qui gagne son scénario sort d'ici (le test
 * échoue sinon), une route nouvelle n'y entre pas — elle arrive avec le sien.
 *
 * Chemin sous `apps/lfd-api/src/`, puis `#méthode` du contrôleur.
 */
const UNREPLAYED: readonly string[] = [
  // La livraison et le colisage : une tournée partie, une journée de colisage
  // ouverte — un semis lourd, que les scènes voisines tiennent sous leur
  // propre amorçage (`delivery-*-scene.ts`, `order-cancel-after-plan-scene.ts`).
  "delivery/http/delivery-loading.controller.ts#declareTransferBins",
  "delivery/http/delivery-rounds.controller.ts#open",
  "delivery/http/delivery-simulation-scenarios.controller.ts#duplicate",
  "delivery/http/my-delivery-doorstep.controller.ts#report",
  "packing/http/packing-containers.controller.ts#allocate",
  "packing/http/packing-containers.controller.ts#open",
  "packing/http/packing-containers.controller.ts#transfer",
  "packing/http/packing-containers.controller.ts#withdraw",
  // Une frontière que ce test ne double pas encore : le jeton de preuve
  // d'une identité tierce, l'adresse de l'abonné de la vitrine.
  "lafoliecoffee/account/http/me.controller.ts#linkIdentity",
  "lafoliecoffee/vitrine/http/admin-vitrine.controller.ts#test",
  // Un semis à reprendre de sa suite : le réassort d'un site, une image
  // portée partout, une réémission du référentiel en cours.
  "lafoliecoffee/resupply/http/admin-site-resupplies.controller.ts#addLine",
  "media/http/media-replace.controller.ts#replace",
  "pim/channels/b2b-platform/http/reemit.controller.ts#reemit",
];

/**
 * Le plafond de la dette : le test échoue si elle le dépasse. Il ne fait que
 * baisser — une route qui gagne son scénario le fait baisser d'autant.
 */
export const REPLAY_DEBT_CEILING = 13;

export const REPLAY_DEBT: ReadonlySet<string> = new Set(
  UNREPLAYED.map((route) => `apps/lfd-api/src/${route}`),
);
