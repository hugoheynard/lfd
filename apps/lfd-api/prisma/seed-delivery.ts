import { PushB2bCatalogCommand } from "../src/pim/channels/b2b-platform/application/push-b2b-catalog.js";
import type { B2bPushSummary } from "../src/pim/channels/b2b-platform/products/push.service.js";
import { bootstrapHarness, SEED_STAFF } from "./seed-pim/harness.js";

/**
 * **Pousser le catalogue vers la plateforme B2B, en local.**
 *
 * Il n'y avait aucun moyen de fabriquer une livraison en attente sur un poste :
 * la route de push est murée par `@AdminSurface("pim_channels")`, donc elle
 * demande un jeton Auth0 réel, et l'écran de réception n'était donc pas
 * développable sans en obtenir un. Ce script emprunte le **bus**, comme
 * `seed:pim` — mêmes handlers, mêmes invariants, même journal.
 *
 * ⚠️ **Simule par défaut**, comme la route. `SEED_DELIVERY_SEND=1` envoie pour
 * de vrai — le défaut d'un script qui écrit dans le catalogue vendu ne doit pas
 * être d'écrire.
 *
 * Zéro changement est un résultat NORMAL et non une panne : le miroir est déjà
 * à jour. Pour obtenir une livraison à relire, il faut d'abord que le
 * référentiel diverge — changer un prix, publier une fiche.
 */
async function main(): Promise<void> {
  const send = process.env["SEED_DELIVERY_SEND"] === "1";
  const harness = await bootstrapHarness();
  try {
    const summary = await harness.runAt(new Date(), SEED_STAFF, () =>
      harness.commands.execute<PushB2bCatalogCommand, B2bPushSummary>(
        new PushB2bCatalogCommand(!send, undefined),
      ),
    );
    console.log(send ? "▸ Envoi RÉEL" : "▸ Simulation (SEED_DELIVERY_SEND=1 pour envoyer)");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await harness.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
