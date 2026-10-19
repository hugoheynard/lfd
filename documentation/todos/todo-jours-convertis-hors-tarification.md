# Les jours convertis en minuit UTC, hors tarification

**Ouvert le 2026-09-08.** **Inventaire refait le 2026-10-19** contre le code du
jour (Explore, puis les sites porteurs rouverts à la main) : le premier datait de
six semaines, et le motif était apparu entre-temps dans une dizaine de fichiers
de la comptabilité. 📐 **Plan** au §5, rien n'est bâti.

> Né d'un effet de bord : `lint:business-day` (chantier 2 de
> [`durcir-le-calcul-des-prix.md`](../pricing/durcir-le-calcul-des-prix.md)) a
> d'abord été lancée sur tout le dépôt et a relevé 19 lignes hors tarification.
> La porte a été resserrée sur les fenêtres tarifaires parce que ces lignes ne
> se jugent pas au même critère. Ce fichier est ce qui reste de ce passage.

---

## 1. Le critère de tri

**Cet instant est-il comparé à autre chose que des instants écrits de la même
façon ?**

- **Non** → conforme, et le corriger serait le défaut. Une journée écrite à
  minuit UTC et relue à minuit UTC est une **clé**.
- **Oui** → décalé. L'écart vaut une à deux heures, et il se paie là où on
  compare — ou là où on **affiche** : un instant de minuit à Paris
  (22 h ou 23 h UTC la veille) ramené à un jour par `toISOString()` affiche
  **la veille**.

Une colonne **`@db.Date`** n'a pas d'heure : Prisma n'y écrit qu'à minuit UTC,
c'est la seule forme qu'elle comprenne.

## 2. Ce que la porte voit, et ce qu'elle ne voit pas

`lint:business-day` ne lit que la tarification (`b2b/pricing`, les écrans de
tarifs) et les opérations datées. Elle ne voit **ni** la comptabilité, **ni**
les commandes, la croissance, le retrait, les abonnements, la médiathèque ou la
production. Son silence n'y prouve rien. Elle ne voit pas non plus le sens
inverse — un instant ramené à un jour par `.toISOString().slice(0, 10)`.

## 3. L'inventaire du 2026-10-19

### Conformes — environ 80 sites, rien à faire

- **Comptabilité, sans exception.** `Invoice.issuedOn`, `dueOn`, `paidOn` sont
  `@db.Date` (`invoice.prisma`, vérifié). La date d'émission est le **jour de
  Paris** au moment de l'émission (`instantToLocal(at).day`, jamais antidatée),
  et c'est cette chaîne qui part dans le PDF (`frenchDate`), dans le XML
  Factur-X et dans la numérotation. Le calendrier SEPA (`collectionDayOf`,
  `pain008-document`, export des mandats) part lui aussi de `instantToLocal`.
  Seule curiosité : la **métadonnée** de date du PDF est écrite à minuit UTC —
  le jour reste exact.
- **Commandes, retrait, dérogations, opérations, abonnements, support** : toutes
  des colonnes `@db.Date` lues et écrites par la même convention.
- **Jours de service** (`serviceDay`, production, livraison, colisage) : des
  chaînes `VARCHAR(10)`, sans aucune conversion.
- **Le courriel d'annulation** (`order-cancelled-mail.ts`, `dayInWords`) : il
  reçoit le jour sous forme de chaîne (`requestedDeliveryDate`) et l'écrit en
  UTC des deux côtés — conforme (vérifié le 2026-10-19).
- **L'ancien §3 (date d'acceptation d'un mandat)** est sans objet aujourd'hui :
  `acceptedAt` est posé par l'horloge. Le piège reviendra seulement si un écran
  fait de nouveau saisir ce jour à la main.
- **L'ancien §4** (`sector-grain.ts`) : des clés civiles, conforme.

### Décalés — deux familles

**a. Des libellés qui affichent la veille (argent : messages de refus).**

| Site                                                                 | Ce qui s'affiche                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `b2b/pricing/application/pricer.ts` (~l. 224–227)                    | « le tarif de X au … est inconnu », « l'historique ne commence que le … » |
| `b2b/pricing/domain/errors/mercuriale-errors.ts`, `shared-errors.ts` | bornes de validité dans les messages de refus                             |
| `b2b/loyalty/domain/errors/loyalty-errors.ts` (~l. 203, 272)         | « ce bon a expiré le … »                                                  |

Les fenêtres tarifaires sont posées à **minuit de Paris** par le front
(`businessDayStart`). `toISOString().slice(0, 10)` les relit en UTC : une
règle valable à partir du 15 octobre est annoncée « à partir du 14 ». Le
calcul du prix est juste ; c'est **le message lu par le staff** qui ment d'un
jour. Pour un bon de fidélité, l'écart ne touche que les échéances tombées
entre 22 h et minuit.

**b. Les écrans d'analyse découpent en jours UTC.** `weekStart`, `dayKey`,
`weekStarts`, `dayRange` (`b2b/growth`) et les quatre lecteurs
(`prisma-order-metrics`, `-acquisition-metrics`, `-market-volume`,
`-sector-revenue`) bornent et rangent **en UTC, des deux côtés** : le calcul est
**cohérent avec lui-même** (la question de l'ancien §2 est tranchée). L'écart
n'existe que face au métier : une commande passée lundi avant 2 h, heure de
Paris, compte dans la semaine précédente. Des chiffres d'analyse, jamais un prix
ni une facture.

### Incertains — arithmétique d'instants

`contact-retention.ts` (limite de conservation RGPD, `setUTCMonth`) et
`media/…/sweep-orphan-media.ts` (`setUTCDate`) retranchent des mois ou des jours
à un instant. L'écart possible est inférieur à un jour sur une durée de
plusieurs mois. Tranché ici : **conforme**, mais pas pour une raison de fuseau — `setUTCDate`
retranche exactement N × 24 h, et l'écart de `setUTCMonth` vient du débordement
de mois (un 31 moins un mois), pas de l'heure (vitruve, 2026-10-19).

## 4. Ce qu'il ne faut pas faire

- **Corriger les `@db.Date`.** Ils n'ont pas d'heure.
- **Élargir la porte à tout le dépôt d'un coup.** Elle crierait sur 80 sites
  conformes ; une porte qui crie sur ce qui va bien finit désactivée.
- **Passer la croissance en jours de Paris sans trancher** : c'est un choix de
  définition (§5, lot 2), pas une correction.

## 5. Le plan — contredit par `vitruve` le 2026-10-19

> Deux BLOQUANTS, trois SÉRIEUX ; le bloquant n° 1 a été rouvert à la main
> (`rule-panel.ts:212`, `pose-bar.ts:52`, vérifiés). Le plan d'origine ne
> regardait que l'API : le défaut le plus grave est **côté écran**, et il ne se
> contente pas d'afficher un mauvais jour — il **pose une mauvaise donnée**.

**Lot 0 — 🔴 le jour proposé par défaut d'une fenêtre tarifaire est le jour de
Paris** (urgent : argent).

- `rule-panel.ts`, `ladder-panel.ts` (`today()`) et `pose-bar.ts` (`validFrom`
  par défaut) calculent « aujourd'hui » par `new Date().toISOString().slice(0, 10)`,
  c'est-à-dire le jour **UTC**. Entre minuit et 1 h (hiver) ou 2 h (été) à
  Paris, c'est **la veille** ; `businessDayStart` en fait le minuit de Paris de
  la veille, et une règle, un barème ou une mercuriale posés sans retoucher la
  date **commencent un jour trop tôt** — rétroactivement, sur des commandes déjà
  passées.
- Remède : un `todayInParis()` à côté de `businessDayStart`
  (`shared/business-day.ts`, sur `instantToLocal`), employé par les trois.
- Le repli `businessDayStart(...) ?? new Date().toISOString()` (les trois
  mêmes écrans) pose un **instant quelconque** si le jour est illisible : il
  devient un refus de saisie.
- Tests : à 00 h 30 heure de Paris, en hiver et en été, le jour proposé est le
  jour de Paris.
- Même défaut, enjeu non tranché : `reglages/commercial/availability-card/availability-card.ts`
  (`isoDay`, commenté « jour local », calcule le jour UTC) et
  `activation-support-panel.ts` côté boutique. Corrigés dans le même lot.

**Lot 1 — les messages de refus disent le jour de Paris.**

- `parisDayOf(instant)` dans `packages/contracts/src/paris-time.ts`, employé par
  `pricer.ts`, `mercuriale-errors.ts`, `shared-errors.ts`.
- ⚠️ Une fenêtre n'est **pas toujours** posée à minuit de Paris : le domaine ne
  l'impose pas (`admin-pricing.controller.ts` prend l'instant envoyé), la graine
  `sub-account-pricing.seed.ts` non plus, et la migration
  `20260909190000_plancher_date` a posé `price_floors.valid_from = updated_at`.
  Le jour de Paris affiché reste le bon jour **calendaire** de l'instant ; ce
  lot ne prétend rien de plus. Imposer minuit de Paris dans le domaine est une
  question à part (§5, lot 1 bis), et toucherait des fenêtres existantes.
- Fidélité : `expiresAt` est un instant (`issuedAt + N × 24 h`), pas une fin de
  journée. Le message dit « a expiré le 15 à 14 h » (jour **et** heure de
  Paris), pas seulement le jour.
- Vérifier avant d'écrire : la nature de `at` dans `NoCanonicalPriceAtError`
  (instant tarifaire, ou jour de livraison `@db.Date`).

**Lot 1 bis — à trancher par Hugo** : le domaine impose-t-il qu'une fenêtre
tarifaire commence à minuit de Paris ? Si oui, il faut décider du sort des
fenêtres existantes posées autrement (planchers datés de leur `updated_at`).

**Lot 2 — la croissance : écrire la convention, ou la changer** (décision de
Hugo).

- **A** : garder l'UTC, et **retirer** le « raffinement Europe/Paris = plus
  tard » du JSDoc de `growth-week.ts` (la convention y est déjà écrite). Coût
  nul.
- **B** : passer en jours de Paris — **tout ou rien** : `weekStart`, `dayKey`,
  `dayRange`, `weekStarts`, les **cinq** lecteurs (dont
  `prisma-market-adoption.reader.ts`) et les six calculs qui les consomment
  (`growth-stats-advanced`, `termination-stats`, `recovery-reaction`,
  `acquisition-metrics`, `market-volume`, `market-adoption`). Changer un côté
  sans l'autre produit des seaux qui ne recouvrent plus leurs bornes. Tests aux
  deux changements d'heure, et relecture des e2e de croissance semés autour
  d'une frontière de semaine.

**Lot 3 — la porte : un helper unique, et le motif brut interdit partout.**

- Recompte : `toISOString().slice(0, 10)` apparaît **43 fois** dans
  `apps/lfd-api/src` (≈ 40 fichiers), et aussi dans les deux fronts et dans
  `prisma/`. Une liste admise de ~35 fichiers serait une porte qui ne tient rien.
- Remède : un seul helper nommé pour l'aller-retour d'une colonne `@db.Date`
  (`dayOfDateColumn`, qui existe déjà en double sous `dayOf` / `dayColumn`), et
  le motif brut **interdit** dans l'API, les deux fronts et `prisma/` — liste
  admise réduite aux usages volontaires nommés
  (`send-guest-order-notice.handler.ts`, jour UTC documenté). Les deux
  commentaires qui citent le motif pour le déconseiller ne comptent pas.
- Ce que la porte ne verra toujours pas, et c'est écrit : les variantes
  (`split("T")`, `getUTCDate` puis formatage).

**Lot 4 — ce fichier devient une doc d'état**, et le TODO se retire.

## 6. Ce que ce plan ne prétend pas

- L'inventaire du §3 a d'abord été fait sur `apps/lfd-api` seul ; les sites
  des fronts n'y sont entrés que par la contradiction (lot 0). Un
  `new Date(x)` sous un nom de variable inhabituel peut encore avoir échappé.
- Le lot 3 tient le motif brut, pas ses variantes.
- La comptabilité est confirmée sur les factures, l'émission et le calendrier
  SEPA ; **non lus** : la date d'émission des avoirs, `write-off-collection-return`,
  la balise `ReqdColltnDt` du `pain008`, le corps de la numérotation.
- Les tests n'ont pas été inventoriés.
