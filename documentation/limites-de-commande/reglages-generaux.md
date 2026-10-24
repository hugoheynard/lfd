# L'heure limite générale — état

> Doc d'état, écrite le 2026-10-21 à partir du code ouvert ce jour-là. Elle
> remplace, pour l'état courant, le §1 de
> [`../commandes/passation/plan-reglages-commandes.md`](../commandes/passation/plan-reglages-commandes.md)
> et le §9 de [`architecture-heure-limite-de-commande.md`](architecture-heure-limite-de-commande.md),
> qui gardent l'historique des décisions. Entrée du dossier : [`README.md`](README.md).

La règle **du commerce** : jusqu'à quand on prend commande pour une journée,
quel que soit l'article. Un article qui porte sa propre limite est jugé par
les deux, et **la plus stricte gagne toujours** (Hugo, 2026-10-21) : une
limite d'article plus tardive ne relâche jamais la règle générale
([`limites-produit.md`](limites-produit.md), [`README.md`](README.md) §2).
(Cette phrase disait l'inverse — « n'est pas jugé par elle » — jusqu'au
2026-10-21 : c'était l'ancien remplacement, défait le même jour.)

**Une seule règle, la générale** — ni point de retrait, ni jour de semaine
(décision de Hugo du 2026-10-21, [`schema-des-reglages.md`](schema-des-reglages.md)
§4, point 4 ; bâti le 2026-10-21, lot 1).

## 1. Les tables

### `public.order_cutoffs` — les règles (`OrderCutoff`, `prisma/schema/public/orders.prisma`)

| Colonne             | Sens                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `pickup_address_id` | toujours `NULL` depuis le 2026-10-21 (CHECK) — colonne gardée, morte   |
| `weekday`           | toujours `NULL` depuis le 2026-10-21 (CHECK) — colonne gardée, morte   |
| `days_before`       | combien de jours avant la journée de service (défaut `1`)              |
| `time`              | `HH:MM`, pendule d'Europe/Paris (jamais un instant UTC)                |
| `grace_minutes`     | le rattrapage après la limite, en minutes (défaut `0`, borne `0..720`) |

**Une ligne au plus, la générale.** La migration
`20261021130000_une_seule_heure_limite_generale` (additive) pose le CHECK
`order_cutoffs_general_only` (point ET jour à `NULL`) et l'index unique
`order_cutoffs_single_rule` (une ligne). Les colonnes restent : une migration
additive ne les retire pas. `resolveOrderCutoff`
(`packages/contracts/src/order-cutoff.ts`) ne rend que la règle générale et
ignore une ligne résiduelle à point ou à jour — pour la passation, la boutique,
le fournil, la relance et la vitrine à la fois. Jusqu'au 2026-10-21, il y avait
une règle par couple (point, jour), la plus spécifique l'emportant. La
conversion en instant passe explicitement par `Europe/Paris` (fuseau : §10 de
[`architecture-heure-limite-de-commande.md`](architecture-heure-limite-de-commande.md)).

**Une ressource, deux routes** (`b2b/order-cutoffs/http/admin-order-cutoffs.controller.ts`,
sous `@AdminSurface("lfc_order_settings")`) : `GET admin/order-cutoffs/general`
rend `{ rule }` (`null` tant qu'elle n'est pas posée) ; `PUT
admin/order-cutoffs/general` la pose ou la règle (entité `GeneralOrderCutoffRule`,
faits `order_cutoff.created` / `order_cutoff.updated`). Une charge qui porte un
point ou un jour est refusée en 400, `order_cutoffs.scope_retired`, avec un
message qui renvoie à la règle générale et à la limite produit. Les routes de
collection (`GET` liste, `POST`, `PATCH /:id`, `DELETE /:id`) sont retirées : la
générale ne se supprime pas, et ne s'éteint plus (l'interrupteur est retiré
le 2026-10-21, §2). L'écran
(`reglages/commandes/cutoffs-section/`) ne montre que la générale ; il ne liste
plus de règles « non reprises ».

### `public.order_cutoff_settings` — le jour même et l'heure du réassort (`OrderCutoffSettings`, `prisma/schema/public/settings.prisma`)

Une ligne au plus, clé `orders` : `same_day_allowed` (défaut `false`),
`resupply_cutoff_time` (l'heure limite du réassort pour demain, « la veille,
HH:MM », défaut `20:00`, CHECK de forme — lot R3a du réassort, 2026-10-21,
migration `20261022100000_le_reassort_au_plan_fige`), et l'auteur du geste.
Vue et `PATCH` portent `resupplyCutoffTime` ; le domaine refuse une heure qui
n'existe pas (`InvalidResupplyCutoffTimeError`, 400). **Ligne absente = jour même non autorisé.** La colonne
`enabled` (l'interrupteur, §2) reste en base, ni lue ni écrite depuis le
2026-10-21. Routes `GET`/`PATCH admin/order-cutoff-settings`
(`lfc_order_settings`) : la vue est `{ sameDayAllowed, updatedAt, updatedBy }`,
le `PATCH` prend `{ sameDayAllowed }` seul (schéma strict : une charge qui
porte `enabled` est refusée en 400). Chaque bascule effective écrit le fait
`order_cutoff_settings.updated` (`{ sameDayAllowed, previous }` ; les lignes
d'avant le 2026-10-21 portent aussi `enabled`, et le journal les lit
toujours), rien quand l'état ne change pas.

### Ce qu'il y a en base (2026-10-21)

- **Production** — d'après Hugo le 2026-10-21 (non vérifié par moi, je n'ai
  pas accès à la base) : **aucune** ligne dans `order_cutoff_settings`, donc
  l'heure limite générale est **activée** ; la règle générale est « la veille
  à 23:00 ». ⚠️ Le §2 de `plan-reglages-commandes.md` relevait « la veille à
  19:00 » le 2026-10-13 : la valeur a changé à l'écran entre les deux.
- **Dev** (`lfc_b2b_dev`, lu le 2026-10-21) : aucune ligne dans
  `order_cutoff_settings` non plus — donc **activée**, jour même refusé — et une
  seule règle, la générale, « la veille à 18:00 », rattrapage `0`.
- Les deux n'ont que la ligne générale dans `order_cutoffs` (prod : lu par Hugo
  le 2026-10-21) : la migration du CHECK y passe.

### Colonnes mortes, à retirer (tenu depuis le 2026-10-21)

Ni lues ni écrites ; elles restent en base jusqu'à un déploiement qui les
supprime, une fois qu'aucun binaire en service ne les nomme.

| Colonne                                                             | Morte depuis         | Pourquoi                                                |
| ------------------------------------------------------------------- | -------------------- | ------------------------------------------------------- |
| `public.order_cutoff_settings.enabled`                              | 2026-10-21           | l'interrupteur de l'heure limite, §2                    |
| `public.order_cutoff_settings.resupply_subject_to_cutoff`           | 2026-10-21 (lot R3a) | remplacée par `resupply_cutoff_time`                    |
| `production.production_settings.close_mode`, `close_at`, `alert_at` | 2026-10-21           | [`plan-une-seule-heure.md`](plan-une-seule-heure.md) §5 |

## 2. L'interrupteur — retiré le 2026-10-21

L'heure limite générale déclenche l'arrêt du plan du fournil
([`plan-une-seule-heure.md`](plan-une-seule-heure.md) §5) : une heure limite
qu'on coupe ne l'arrêterait plus. Elle est donc **toujours en vigueur** dès
qu'elle est posée : `OrderCutoffsInForce`
(`b2b/order-cutoffs/domain/order-cutoffs-in-force.ts`, implémenté par
`GeneralOrderCutoffInForce`) rend la règle générale enregistrée sans lire
`enabled`, pour la passation (`OrderCutoffReader`, donc aussi la relance de
règlement), la boutique (`ListFulfillmentDaysHandler`, catalogue) et le fournil
(`ProductionOrderCutoffRulesReader`). Le geste et l'affichage sont retirés du
back-office ; la page `/pim/limites-de-commande` ne dit plus « désactivée ».
Une ligne résiduelle à `enabled = false` ne coupe rien (e2e
`order-cutoff-switch`).

Tant qu'aucune règle générale n'est posée, rien n'est opposé et rien n'arrête
le plan tout seul.

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

**À l'écran (2026-10-21)** : la page de l'heure limite a, sous l'heure, une
section « Rattrapage » qui réunit la durée (réglée avec l'heure, sous
`lfc_order_settings`), les dérogations (`cutoff-waivers-card`, sous
`b2b_order_waivers:read`) et la surtaxe **en lecture**
(`late-fee-summary-card` : montant et taux sous `b2b_late_fee:read` — sans ce
droit la carte le dit et ne lit rien ; lien « Modifier dans Comptabilité »
sous `b2b_late_fee:write`). La surtaxe se règle toujours en Comptabilité
(`/comptabilite/surtaxe-de-retard`), dont l'écran renvoie à cette page.

**Le devis du comptoir** (`POST admin/orders/quote`, 2026-10-21) signale
l'heure limite du jour visé quand on lui donne `requestedDeliveryDate` :
`cutoff: { status, until }` — `open` (jusqu'à `until`, grâce non comprise),
`grace` (jusqu'à la fin du rattrapage), `closed`. Même décision que la
passation, sans les dérogations : il dit l'état de la journée, il ne refuse
rien (`OrderCutoffNotice`).

## 4. Le jour même

Sa page depuis le 2026-10-21 : **Réglages › Commandes › Jour même**
(`/reglages/commandes/jour-meme`, `reglages/commandes/same-day-page/`, entrée
du rail et des tuiles), sous `lfc_order_settings` — il quittait l'écran de
l'heure limite avec l'interrupteur ([`plan-une-seule-heure.md`](plan-une-seule-heure.md) §6).

`same_day_allowed` à `false` (défaut) : aujourd'hui n'est pas proposé par la
boutique et toute passation qui vise une journée non postérieure à aujourd'hui
est refusée (`orders.same_day_closed`) — client, invité et équipe. Exception :
l'équipe sur un plan arrêté est reçue hors plan sans que ce réglage s'y oppose.

## 5. L'arrêt du plan

Une journée dont le plan du fournil est arrêté n'est plus proposée
(`ClosedPlansReader`) et refuse la commande client
(`orders.production_plan_closed`, sous le verrou `production_day:<jour>`) ;
l'équipe est reçue, marquée `placed_off_plan`. Depuis le 2026-10-21, le plan
s'arrête tout seul à la **plus tardive** de la fin du rattrapage de la règle
générale et de l'heure du réassort (lot R3a, même jour) — l'écran de
l'heure limite le dit (« Heure limite générale — arrêt du plan de production
pour le lendemain »). Voir [`../production/arret-du-plan.md`](../production/arret-du-plan.md).

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

- ~~Où vit la règle générale à terme~~ — tranché le 2026-10-21 : ici, au
  commerce ([`schema-des-reglages.md`](schema-des-reglages.md) §4, point 1) ;
  le [démontage](demontage-order-cutoff.md) est caduc.
- ~~Une règle par clientèle~~ — le modèle du 2026-10-21 l'écarte
  ([`schema-des-reglages.md`](schema-des-reglages.md) §0) : demain avant
  l'heure limite pour tout le monde, aujourd'hui sur le stock (chantier à
  part, le stock de la vitrine n'existe pas encore).
