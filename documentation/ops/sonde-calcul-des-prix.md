# La sonde du calcul des prix

> ✅ **Bâti le 2026-10-15**. Hugo :
> « je trouve ça intéressant pour nous en ops d'avoir cette donnée, donc mettre
> une sonde ». Ne touche pas l'argent : elle **mesure** le calcul, elle ne le
> change pas.

## Pourquoi

La question du jour : faut-il un cache par client, ou des réplicas, quand on
aura 200 clients pros avec mercuriales ? La réponse honnête était « mesurer
d'abord » ([`pricing/optimisation-resolution-de-prix.md`](../pricing/optimisation-resolution-de-prix.md)).
Cette sonde est la mesure.

Le trafic de la passerelle donne déjà un p95 par surface
(`ops/traffic/traffic-query.ts`, Analytics Engine) : c'est ce que **ressent** le
client, réseau compris, mais toutes routes d'une surface mêlées. La sonde dit
ce que coûte **le calcul lui-même**, et combien de fois on le fait.

## Ce qu'elle mesure

À chaque résolution d'un lot de prix, une mesure. Elle est prise dans
`Pricer.load` (`b2b/pricing/application/pricer.ts`), qui est la porte unique :
il appelle `PricingMaterialsLoader` et tend le tarificateur. Le calcul de
chaque ligne qui suit est synchrone et en mémoire (`PricedLot`) ; il n'est
**pas** dans la durée. Un lot refusé (vide, SKU en double) n'est pas mesuré.

| Champ      | Ce que c'est                                             |
| ---------- | -------------------------------------------------------- |
| `caller`   | qui demande : `shelf`, `cart`, `checkout`, `back-office` |
| `audience` | `pro` ou `public`                                        |
| `items`    | nombre d'articles du lot                                 |
| `ms`       | durée de la résolution, lectures en base comprises       |

Les valeurs de `caller` sont en anglais (lexique) et s'affichent Rayon,
Panier, Passation, Back-office. `caller` est **obligatoire** sur `LotRequest` :
un appelant neuf ne compile pas sans se nommer. Qui dit quoi (vérifié le
2026-10-15) :

| `caller`      | Appelant                                                                 |
| ------------- | ------------------------------------------------------------------------ |
| `shelf`       | `ShopCataloguePricing` — vitrine publique et rayon reconnu               |
| `cart`        | `ShopCartQuoting` (panier boutique) et `OrderDrafting.quote` (devis pro) |
| `checkout`    | `OrderDrafting.draft` — client, boutique et saisie de l'équipe           |
| `back-office` | `PriceProjectionQuery` (projection de l'écran de tarification)           |

L'`audience` se déduit comme partout : sans société, `public` ; sinon `pro`.

⚠️ Le tableau de tarification (`board-item.ts`) ne passe pas par `Pricer.load`
(il monte son tarificateur par `pricerOver`) : il n'est pas mesuré.

Rien de nominatif : ni client, ni article, ni prix. Une mesure ne peut pas
fuiter un tarif.

## Où elle vit — la matrice des blocs

`ops` n'importe aucun bloc métier, et personne n'importe `ops` (CLAUDE.md §3).
Donc :

- `platform/metrics/` déclare des ports techniques, sans métier :
  `TimingRecorder.record(name, labels, ms, size)` (écriture),
  `TimingWindowReader.read(name)` (lecture, ISP) et `Stopwatch` (une durée,
  sur l'horloge monotone — ni `Clock`, gelé à l'ingress, ni `WallClock`,
  réservé aux baux). Un seul adaptateur, `InMemoryTimings`, sur le modèle de
  `ops/vitals/vitals.store.ts` : fenêtre glissante de 30 minutes, 2 000
  mesures au plus par nom. `MetricsModule` (global) fait pointer les deux
  ports sur la même instance ;
- `b2b/pricing` enregistre sous le nom `pricing.resolve` ;
- `ops/health` lit la fenêtre (`ReadPricingProbeHandler`, route
  `GET /admin/ops/health/pricing`, surface `ops_health`, contrat
  `PricingProbeReport` dans `@lfd/ops-contract`) : nombre de lots, p50 et p95
  en ms, taille moyenne d'un lot, **par `caller` et par `audience`** — le
  rayon pro (mercuriales) et le rayon public ne coûtent pas la même chose, et
  c'est la question posée. Route à part de `/admin/ops/health` : un calcul
  lent n'est pas une panne.

⚠️ **En mémoire, par instance** : avec plusieurs conteneurs, chacun voit sa
part. C'est la même limite que les vitals, assumée pour la même raison — une
tendance, pas une comptabilité. Le jour où il faut l'agrégat, la mesure part
vers Analytics Engine comme le trafic.

## L'écran

Une carte titrée « Temps de calcul des prix » dans la carte de santé du
back-office (`app/ops/pricing-probe/`), juste après la table de charge du
trafic : les quatre chiffres par appelant et audience, relus toutes les 15 s,
et un état par ligne jugé côté serveur sur le p95 — `attention` dès 240 ms
(80 %), `exceeded` (« Lent ») dès 300 ms. Le seuil est une constante,
`PRICING_P95_THRESHOLD_MS` dans `ops/health/pricing-probe.ts`, réglable comme
les seuils média. L'écran dit la fenêtre, le seuil, et qu'il ne voit que son
instance.
