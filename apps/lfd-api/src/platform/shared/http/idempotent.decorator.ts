/**
 * Range une route d'écriture dans la case « **rejouer ne refait rien** », et
 * dit pourquoi (`documentation/ops/l-idempotence-des-ecritures.md`).
 *
 * Un double clic, un réseau qui coupe après l'envoi, un onglet qui rejoue sa
 * requête : la même écriture peut arriver deux fois. Chaque `@Post`, `@Put`,
 * `@Patch` et `@Delete` d'un contrôleur est donc rangé, et
 * `pnpm gate write-idempotence` refuse celui qui ne l'est pas :
 *
 * - **par intention** : `@IntentKey()` dans la signature, et le handler de la
 *   commande passe par `OncePerIntent.runSealed` — la porte le vérifie seule,
 *   sans ce décorateur ;
 * - **par nature, par sa propre clé, appelée par la machine, webhook** : ce
 *   décorateur, avec la raison. Elle nomme le mécanisme — « pose une valeur,
 *   le rejeu laisse le même état », « clé `OrderIdempotency` », « identifiant
 *   de l'événement Stripe », « balayage sous `RecomputeGuard`, état relu ».
 *
 * La raison est **déclarative** : la porte vérifie qu'elle existe, pas
 * qu'elle est vraie. Elle se relit en revue, et c'est pour le lecteur
 * qu'elle est écrite. Une route qui crée un identifiant neuf à chaque appel
 * ou déclenche un effet externe (e-mail, Stripe, Auth0, stockage) n'est pas
 * idempotente par nature : elle prend une clé d'intention.
 *
 * Sans effet à l'exécution : le décorateur ne pose ni métadonnée ni
 * intercepteur. Un intercepteur qui garderait la réponse HTTP masquerait les
 * gestes qui ne doivent pas être rejoués ; c'est le handler qui sait.
 */
export function Idempotent(_reason: string): MethodDecorator {
  return () => undefined;
}
