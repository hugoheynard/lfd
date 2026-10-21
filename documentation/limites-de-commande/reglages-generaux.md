# L'heure limite générale — état

> Doc d'état, écrite le 2026-10-21 à partir du code ouvert ce jour-là. Elle
> remplace, pour l'état courant, le §1 de
> [`../commandes/plan-reglages-commandes.md`](../commandes/plan-reglages-commandes.md)
> et le §9 de [`architecture-heure-limite-de-commande.md`](architecture-heure-limite-de-commande.md),
> qui gardent l'historique des décisions. Entrée du dossier : [`README.md`](README.md).

La règle **du commerce** : jusqu'à quand on prend commande pour une journée,
quel que soit l'article. Un article qui porte sa propre limite n'est pas jugé
par elle ([`limites-produit.md`](limites-produit.md)).

## 1. Les tables

### `public.order_cutoffs` — les règles (`OrderCutoff`, `prisma/schema/public/orders.prisma`)

| Colonne             | Sens                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `pickup_address_id` | le point de retrait visé ; `NULL` = règle par défaut de la plateforme  |
| `weekday`           | `mon`…`sun` ; `NULL` = tous les jours                                  |
| `days_before`       | combien de jours avant la journée de service (défaut `1`)              |
| `time`              | `HH:MM`, pendule d'Europe/Paris (jamais un instant UTC)                |
| `grace_minutes`     | le rattrapage après la limite, en minutes (défaut `0`, borne `0..720`) |

Une règle par couple (point, jour) ; la plus spécifique gagne
(`resolveOrderCutoff`, `packages/contracts/src/order-cutoff.ts`). La conversion
en instant passe explicitement par `Europe/Paris` (fuseau : §10 de
[`architecture-heure-limite-de-commande.md`](architecture-heure-limite-de-commande.md)).

L'écran (`reglages/commandes/cutoffs-section/`) n'**édite que la ligne
générale** (`pickup_address_id` et `weekday` à `NULL`) ; une règle par point ou
par jour se lit, marquée « non reprise ». Routes `admin/order-cutoffs`
(GET/POST/PATCH/DELETE), sous `@AdminSurface("lfc_order_settings")`.

### `public.order_cutoff_settings` — l'interrupteur et le jour même (`OrderCutoffSettings`, `prisma/schema/public/settings.prisma`)

Une ligne au plus, clé `orders` : `enabled` (défaut `true`), `same_day_allowed`
(défaut `false`), et l'auteur du geste. **Ligne absente = activée, jour même
non autorisé.** Routes `GET`/`PATCH admin/order-cutoff-settings`
(`lfc_order_settings`) ; chaque bascule effective écrit le fait
`order_cutoff_settings.updated`, rien quand l'état ne change pas.

### Ce qu'il y a en base (2026-10-21)

- **Production** — d'après Hugo le 2026-10-21 (non vérifié par moi, je n'ai
  pas accès à la base) : **aucune** ligne dans `order_cutoff_settings`, donc
  l'heure limite générale est **activée** ; la règle générale est « la veille
  à 23:00 ». ⚠️ Le §2 de `plan-reglages-commandes.md` relevait « la veille à
  19:00 » le 2026-10-13 : la valeur a changé à l'écran entre les deux.
- **Dev** (`lfc_b2b_dev`, lu le 2026-10-21) : aucune ligne dans
  `order_cutoff_settings` non plus — donc **activée**, jour même refusé — et une
  seule règle, la générale, « la veille à 18:00 », rattrapage `0`.

## 2. L'interrupteur

Désactivée, la règle générale **n'est plus servie** : le port
`OrderCutoffsInForce` (`b2b/order-cutoffs/domain/order-cutoffs-in-force.ts`)
rend « aucune règle » à la passation (`OrderCutoffReader`, donc aussi la
relance de règlement), à la boutique (`ListFulfillmentDaysHandler`, catalogue)
et au fournil (`ProductionOrderCutoffRulesReader`, qui n'a alors plus de borne
pour son heure d'arrêt). La règle **reste en base** ; la réactiver la remet
telle quelle. L'écran d'administration lit toujours les règles.

Ce que l'interrupteur ne coupe pas : les **limites d'article**, avec leur grâce,
leurs dérogations et leur surtaxe ; l'arrêt du plan ; le jour même.

⚠️ Sans règle, la relance de règlement (`isSettlementReminderDue`) ne part
plus — laissé tel quel, non tranché par Hugo (plan des réglages §8.3).

## 3. Rattrapage et dérogations

Dans la fenêtre `limite → limite + grace_minutes`, le client est refusé par
`orders.cutoff.grace` (« appelez-nous ») au lieu de `orders.cutoff.past`.
Seule une **dérogation** fait passer, et seulement dans cette fenêtre.

`public.order_cutoff_waiver` (`OrderCutoffWaiver`) : **une société × une
journée**, un motif obligatoire, le staff qui l'accorde ; **consommée** par une
commande (`used_by_order_id`, `used_at`), jamais supprimée. L'index partiel
`order_cutoff_waiver_one_open` interdit deux dérogations non consommées pour la
même société et la même journée. Accordée pendant la saisie d'une commande par
l'équipe ; listée (journées non passées) par `GET admin/order-cutoff-waivers`,
lue par société, révoquée par `DELETE …/:id` — sous `b2b_order_waivers`
(`b2b/order-waivers/http/admin-order-cutoff-waivers.controller.ts`). Une
commande sans société n'a pas de dérogation possible.

Une dérogation utilisée déclenche la **surtaxe de retard** : §8 de
[`architecture-heure-limite-de-commande.md`](architecture-heure-limite-de-commande.md).

## 4. Le jour même

`same_day_allowed` à `false` (défaut) : aujourd'hui n'est pas proposé par la
boutique et toute passation qui vise une journée non postérieure à aujourd'hui
est refusée (`orders.same_day_closed`) — client, invité et équipe. Exception :
l'équipe sur un plan arrêté est reçue hors plan sans que ce réglage s'y oppose.

## 5. L'arrêt du plan

Une journée dont le plan du fournil est arrêté n'est plus proposée
(`ClosedPlansReader`) et refuse la commande client
(`orders.production_plan_closed`, sous le verrou `production_day:<jour>`) ;
l'équipe est reçue, marquée `placed_off_plan`. Ce n'est pas un réglage du
commerce : voir [`../production/arret-du-plan.md`](../production/arret-du-plan.md).

## 6. `/fulfillment-days` et ce que la boutique en dit

`ListFulfillmentDaysHandler` (`b2b/order-cutoffs/application/`) rend, pour la
livraison (en tête) puis pour chaque point de retrait, **la première journée
proposable** : dans les délais des règles en vigueur, hors plans arrêtés, hors
aujourd'hui si le jour même n'est pas autorisé, et dans les jours de retrait
d'une opération datée que porte le panier. Cette lecture **n'autorise rien** :
elle ne connaît pas les limites d'article, et la passation reste l'autorité.

Depuis le 2026-10-21 (`fe78e1db8`), chaque journée porte **`orderUntil`** :
l'instant limite **annoncé** (`announcedOrderUntil`, `@lfd/contracts`), grâce
non comprise, ou `null` (aucune journée, aucune règle en vigueur, heure sautée
au passage à l'heure d'été).

La boutique (`apps/lfc-ecommerce-frontend/src/app/client/shop/service-day-notice.rules.ts`,
fonction pure `decideDayNotice`, horloge `ShopClock` qui avance de minute en
minute) :

| Situation                                                   | Ce qui se dit                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| jour gardé antérieur au premier jour accordé                | « Trop tard pour {jour} : le premier jour encore possible est … » |
| premier jour accordé après demain, panier d'opération datée | « Ce produit se retire à partir du … »                            |
| premier jour accordé après demain                           | « Trop tard pour demain[, la limite était 23 h] : … »             |
| limite du premier jour aujourd'hui, ≤ 6 h restantes         | « Plus que 2 h 15 pour commander pour mercredi. »                 |
| limite du premier jour aujourd'hui, > 6 h restantes         | « Pour mercredi, commandez avant 23 h. »                          |
| sinon                                                       | rien — la barre nomme déjà le jour retenu                         |

Le seuil de six heures est `COUNTDOWN_THRESHOLD_MINUTES`. L'heure dans « trop
tard » n'est dite que si la limite de demain a été **lue avant de tomber**.
Quand une limite tombe page ouverte, la boutique relit `/fulfillment-days` une
fois. Un jour gardé antérieur au premier jour accordé n'est **pas** remplacé
d'office (Hugo) : le créneau choisi pourrait ne pas exister l'autre jour. Quand
une limite d'article du panier tombe plus tôt, c'est elle qui est nommée
([`limites-produit.md`](limites-produit.md) §6). La grâce ne s'annonce jamais.

### L'incident de la démo du 2026-10-20, et sa correction

En démo sur la boutique de production, à 15 h, sous une limite à 23 h, la barre
a dit « Trop tard pour demain ». La cause : `ServiceDayNotice` comparait le
**jour gardé dans le navigateur** (localStorage — un jour choisi plus tôt, ou
celui d'une opération) à demain, et disait « trop tard » dès qu'il était
postérieur, alors que `/fulfillment-days` accordait bien demain. Correction
(`fe78e1db8`, 2026-10-21) : « trop tard » ne se dit plus que quand le **premier
jour accordé par le serveur** est postérieur à demain ; avant, on prévient,
avec l'`orderUntil` servi. La régression est nommée dans le JSDoc de
`decideDayNotice` et couverte par `service-day-notice.rules.spec.ts`.

## 7. Ce qui reste ouvert

- **Où vit la règle générale à terme** (B : le rang global du référentiel ; C :
  une table du commerce par clientèle) — Q9 de `plan-reglages-commandes.md`,
  préalable à la reprise du [démontage](demontage-order-cutoff.md).
- **Une règle par clientèle** : le public suit la même règle générale que les
  pros (`ensureNotTooLate` ne distingue pas la clientèle, vérifié le
  2026-10-21) — [`plan-heure-limite-par-clientele.md`](plan-heure-limite-par-clientele.md).
