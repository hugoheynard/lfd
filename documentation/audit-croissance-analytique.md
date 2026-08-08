# Audit analytique — dashboard Croissance

Audit de **couverture** (quelles questions business le dashboard sait répondre)
et de **justesse** (est-ce que ce qu'il affiche est vrai). Périmètre : l'onglet
Croissance de l'admin B2B. **Hors périmètre** : composition du catalogue / mix
produits (mis de côté volontairement).

Contexte métier : LaFolieDouce vend à des pros (restaurants, hôtels, bars) en
**stations de ski de Savoie**. C'est un business **très saisonnier**, à
**réachat fréquent**, où le client type est une société qui recommande chaque
semaine. Ce contexte est la grille de lecture de tout ce qui suit.

---

## 1. Verdict en une page

Le dashboard couvre bien **l'acquisition et la conquête de territoire**. Il ne
couvre presque pas **la valeur du parc dans le temps** :

| Domaine | Couverture |
|---|---|
| Acquisition, canal, pipeline | ✅ solide |
| Conquête territoriale | ✅ solide |
| CA, panier, type de commande | ✅ récent (Volume / CA) |
| Churn **déclaré** + rattrapage | ✅ solide |
| **Saisonnalité / comparaison N-1** | ❌ absent — *le manque n°1 pour ce métier* |
| **Rétention réelle (churn silencieux)** | ❌ absent |
| **Valeur client / LTV / cohortes de CA** | ❌ absent |
| **Abonnement (récurrent, skip, MRR)** | ❌ absent |
| **Concentration nommée du risque** | ⚠️ anonyme, non actionnable |
| **Rentabilité / marge** | ❌ bloqué par le modèle |
| **Encaissement / DSO** | ❌ bloqué par le modèle |

Deux idées à retenir :

1. **On mesure la saisie commerciale, pas la rétention.** L'onglet « Rétention &
   churn » ne lit que `growth.company_terminations`, une table alimentée à la
   main. En B2B la sortie est silencieuse : le client arrête de commander sans
   rien déclarer. Ce churn-là est **invisible** aujourd'hui.
2. **La fenêtre de 13 semaines est un plafond de verre.** Elle est codée en dur
   dans tous les readers. Dans un métier saisonnier, on ne peut donc jamais
   comparer une saison à la précédente — la question business la plus
   importante du secteur.

---

## 2. Manques par ordre de valeur

Colonne **Faisable** : « OUI » = calculable avec les données déjà en base.

### 2.1 Saisonnalité & prévision — priorité maximale

| # | Question | Métrique | Faisable |
|---|---|---|---|
| M1 | Cette semaine est-elle meilleure que la même semaine l'an dernier ? | CA indexé **semaine ISO × saison (N vs N-1)** | **OUI** (`orders.created_at`, `total_cents`). Bloqué seulement par `WINDOW_WEEKS = 13` codé en dur |
| M4 | Mes clients reviennent-ils d'une saison à l'autre ? | Rétention **saison N → N+1** par compte | **OUI** (`orders.company_id` + `created_at`) |
| M2 | Quel CA sur les 4 prochaines semaines ? | Carnet ferme + échéances d'abonnement | **Partiel** : `orders.requested_delivery_date` (indexé) et `subscription_occurrences.occurrence_date` donnent le **volume**. Le **€** exige les prix PIM (`subscription_lines` n'a que sku/quantité) |
| M3 | Quel est mon socle hors-saison vs mon pic ? | Ratio pic/creux, part du CA sur les 12 semaines fortes | **OUI** |

### 2.2 Valeur client & rétention réelle

| # | Question | Métrique | Faisable |
|---|---|---|---|
| M6 | Combien de clients ai-je **vraiment** perdus ? | Actifs (≥1 commande / 60 j) vs dormants vs perdus de fait | **OUI** (dernier `orders.created_at` par `company_id`) |
| M7 | Combien d'euros le churn me coûte-t-il ? | Churn **en valeur** (CA annualisé des partis), par motif | **OUI**. Aujourd'hui le churn est compté **en nombre de comptes** : perdre un hôtel à 40 k€ pèse autant qu'un bar à 800 € |
| M5 | Combien rapporte un client sur sa vie ? | LTV par **cohorte d'activation** (mois × ancienneté) | **OUI** (`companies.activated_at` + `orders`) |
| M8 | Mon parc existant dépense-t-il plus ? | NRR / waterfall nouveaux · expansion · contraction · perdus | **OUI** |
| M9 | À quelle fréquence commande un client, ralentit-il ? | Intervalle médian entre commandes + alerte « intervalle × 2 » | **OUI** |
| M10 | Délai 1re → 2e commande (vrai signal d'activation B2B) | Time-to-2nd-order, réachat à 30/60/90 j | **OUI** |
| M11 | Mes dormants réactivés ? | Efficacité du play `win_back` (qui existe déjà dans le scoring, sans mesure) | **OUI** |
| M12 | Structure du parc aujourd'hui ? | Segmentation **RFM** des comptes actifs | **OUI** |

### 2.3 Abonnement — le levier de verrouillage, non mesuré

| # | Question | Métrique | Faisable |
|---|---|---|---|
| M13 | Combien d'abonnements actifs, quel revenu récurrent ? | Nb actifs, pénétration abonnement du parc, MRR | **OUI** via le CA réel des commandes filles (`orders.from_subscription_id`). Le MRR « théorique » exigerait les prix PIM |
| M15 | Mes abonnements s'effritent-ils ? | Churn d'abonnement + **taux de skip** | **OUI** — `subscription_occurrences.skipped` est déjà stocké et **jamais exploité** : signal d'attrition avancé, gratuit |
| M14 | Un abonné vaut-il plus ? | CA / rétention / fréquence, abonnés vs non-abonnés | **OUI** |

### 2.4 Concentration du risque

| # | Question | Métrique | Faisable |
|---|---|---|---|
| M16 | Si je perds mon top 3 ? | **Top N clients nommés** + part du CA, HHI | **OUI**. Le Lorenz actuel est anonyme : on voit qu'il y a concentration, jamais **qui** |
| M17 | Mon risque est-il concentré sur une station ? | **CA par zone / code postal** | **OUI**. Le CA n'est jamais ventilé géographiquement — l'onglet Marché ne parle que de comptes, jamais d'euros |

### 2.5 Cycle de vente & opérations

| # | Question | Métrique | Faisable |
|---|---|---|---|
| M23 | Combien de temps entre 1er contact et 1er euro ? | Durée par étape, taux de passage, CA généré par les leads | **OUI** (`leads` + `activity_events` horodatés + `linked_user_id`). Le pipeline actuel n'est qu'un **stock**, sans temps ni euros |
| M21 | Quel est mon CA **HT marchandises** ? | `subtotal − discount`, séparé des frais de port et de la TVA | **OUI, trivial** — colonnes déjà là (voir §3, c'est aussi un **bug**) |
| M28 | Quel préavis me laissent mes clients pour produire ? | Lead time `created_at → requested_delivery_date` | **OUI** — directement actionnable pour le labo |
| M26 | Le SAV est-il un signal de départ ? | Volume `support_requests` par compte, corrélation churn | **OUI** — table **totalement inexploitée** |
| M25 | Mes clients annulent-ils ? | Taux et € annulés (`orders.status = cancelled`) | **OUI** |
| M30 | Quelle part du CA n'est rattachée à aucune société ? | CA `company_id = null` (zéro-friction) | **OUI** — ce trou d'attribution fausse déjà les graphes NAF/territoire |
| M31 | Combien de temps un dossier reste bloqué, sur quelle pièce ? | Âge des `pending` par pièce | **OUI** — `stalledDays` est **déjà calculé** et jamais graphé |

### 2.6 Bloqué par le modèle de données

| # | Question | Ce qui manque |
|---|---|---|
| M19 | **Quelle marge je fais ?** | `order_lines` n'a **aucun coût** (`unit_price_cents`, `line_total_cents`, `vat_rate` seulement). Il faudrait un `cost_cents` snapshoté à la commande, ou un référentiel coût matière par SKU importé du PIM. **Sans ça, toute analyse de rentabilité est hors d'atteinte** |
| M22 | **Suis-je payé, et quand ?** (DSO, encours) | `orders.paid_at` n'existe que pour Stripe `per_order` ; les termes `monthly`/`net60`/`net90` restent à `not_required` → **jamais encaissés dans le système**. Il faudrait une table facture/échéance/encaissement. Dérivé possible dès aujourd'hui : exposition du CA **par terme de paiement** |
| M29 | Livre-t-on à l'heure ? | Aucune date de livraison **réelle** (`fulfilled` n'a pas d'horodatage dédié). Il faudrait `fulfilled_at` sur `Order` |
| M24 | Combien me coûte un client acquis (CAC) ? | Aucune donnée de dépense (marketing, temps commercial) |

---

## 3. Défauts des statistiques actuelles

### 🔴 Bugs de justesse (le graphe affiche un chiffre faux)

1. **Le CA compte les commandes annulées.** `PrismaOrderMetricsReader`,
   `PrismaMarketVolumeReader` et `PrismaSectorRevenueReader` somment
   `orders.total_cents` **sans filtrer `status`** : les `draft` et `cancelled`
   sont comptés comme du CA. Surestimation directe, sur tous les graphes CA.
2. **Le « panier moyen » n'est pas un panier.** `total_cents` est le **TTC frais
   de port inclus**. Le panier moyen monte quand la TVA ou les frais de
   livraison montent, sans qu'un euro de marchandise ait bougé.
   `subtotal_cents − discount_cents` existe et n'est jamais utilisé.
3. **L'entonnoir de démarchage sous-compte.** `LEAD_RANK` (`growth-stats.ts`) ne
   contient pas `lost` → `rankOf()` renvoie **-1**. Un lead contacté, qualifié
   puis perdu **disparaît des marches « Contactés » et « Qualifiés »**. Les
   étapes intermédiaires sont systématiquement sous-estimées, ce qui donne
   l'illusion d'un excellent taux de passage.
4. **Adoption par territoire — barre et courbe se contredisent.** `zone.total`
   compte toute société `active`, y compris sans `activated_at` ; la trajectoire
   (`zoneTrends`) ne compte que celles qui en ont une. Deux chiffres différents
   pour la même zone. En prime, une société **sans adresse** est silencieusement
   exclue des deux barres, sans compteur d'exclusion.
5. **Concentration : population hétérogène.** `accountConcentration` groupe par
   `payload.companyId ?? subjectId` : les commandes zéro-friction sont comptées
   **par personne**, les autres **par société**. Le nombre de « comptes » est
   gonflé et le Gini biaisé à la hausse.

### 🟠 Graphes qui ne peuvent pas dire la vérité

6. **« Marché vs volume » ne peut jamais annoncer une mauvaise nouvelle.** Il
   oppose un **CA cumulé** (monotone croissant par construction) à un marché
   **constant** (`marketActors` est une valeur unique répétée sur toutes les
   semaines). L'écart se creuse **mécaniquement**, même pendant un effondrement
   du CA hebdo. Corollaire : deux des trois « interprétations possibles »
   affichées sous le graphe (« CA ↑ marché ↓ », « CA ↓ marché ↓ ») sont
   **impossibles** avec l'implémentation actuelle.
7. **Le taux de rattrapage est auto-flatteur.** Son dénominateur est le nombre de
   **tentatives enregistrées**. Plus les commerciaux oublient de saisir les
   départs secs, meilleur paraît le taux.
8. **Pas de garde-fou sur les petits effectifs** pour le rattrapage par
   catégorie (alors que l'adoption grise bien ses `n < 10`) : une barre à 100 %
   sur 1 seule tentative s'affiche comme un succès.
9. **L'entonnoir d'activation invente des fuites.** Une pièce configurée
   `hidden` dans `PlatformSettings` produit une « fuite » de 100 % qui n'est pas
   une friction mais un réglage. Rien à l'écran ne le signale.
10. **Cohortes de rétention inadaptées au B2B.** La cohorte est une **semaine
    d'inscription d'une personne** (en B2B c'est le **compte** qui est retenu), et
    « retenu » signifie *a commandé cette semaine-là* : un client qui commande
    toutes les 2 semaines apparaît non-retenu une semaine sur deux → damier
    illisible et faussement alarmant.

### 🟡 Cohérence et hygiène

11. **Fenêtres incohérentes.** 13 semaines pour l'acquisition, le CA, l'adoption ;
    **all-time** pour le sunburst, le rattrapage, le donut de mode d'acquisition,
    le Lorenz **et tous les KPI du bandeau**. Le KPI « Commandes / total € » ne se
    réconcilie avec aucun graphe de la page.
12. **Deux sources de vérité pour le même fait.** La concentration est calculée
    **depuis le journal** (`activity_events`), le CA depuis la table `orders`. Or
    `ActivityRecorder` est *best-effort et n'échoue jamais* : tout événement perdu
    crée un écart silencieux. Aucune carte de complétude/fraîcheur du journal.
13. **Totaux « CA » non réconciliés.** « CA par secteur NAF » exclut les commandes
    sans société **et** les NAF non ciblés ; « CA dans le temps » inclut tout. Deux
    cartes « CA » dans le même onglet, avec des totaux différents et aucune mention
    de l'écart.
14. **Indexation base 100 fragile en saisonnier.** La base est la **1re période de
    la fenêtre** : si c'est une inter-saison à quasi zéro, toutes les lectures
    explosent. Une base = moyenne des k premières périodes serait robuste.
15. **KPI morts.** « Conversion = activées ÷ déclarées » est all-time cumulatif :
    le dénominateur ne fait que grossir, la valeur se fige et ne réagit plus à
    aucune action. Il faudrait un taux **par cohorte de déclaration**.
16. **Bucketing en UTC.** `dayKey()`/`weekStart()` découpent en UTC : les commandes
    passées en soirée l'été (UTC+2) basculent au jour suivant. Décalage
    systématique des courbes journalières, gênant quand l'heure de coupe compte.
17. **Biais de survivance sur les délais.** `velocityMetrics` apparie
    `company.declared → company.activated` dans le journal : toute société
    antérieure au démarrage du journal disparaît de la distribution, sans
    avertissement.
18. **Doublons.** « Délai de réaction par catégorie » et « — par semaine » sont la
    même mesure (la version hebdo, qui exige n ≥ 3 par cellule, sera quasi vide en
    volume réel) ; idem « Taux de rattrapage » vs « Vélocité de rattrapage ». Le
    donut « Mode d'acquisition » n'ajoute rien à la version hebdo empilée.

---

## 4. Ordre d'attaque conseillé

**Lot 1 — corriger ce qui est faux (rapide, fort impact).** Filtrer les statuts
de commande dans les 3 readers CA (§3.1) ; exposer le CA **HT marchandises** à
côté du TTC (§3.2, M21) ; ajouter `lost` à `LEAD_RANK` (§3.3) ; aligner le
dénominateur d'adoption (§3.4) ; garde-fou petits effectifs sur le rattrapage
(§3.8). Rien de tout cela ne demande une évolution du modèle.

**Lot 2 — débloquer la saisonnalité.** Rendre la fenêtre configurable (elle est
codée en dur à 13 semaines partout), puis livrer la **comparaison N vs N-1**
(M1) et la **rétention saison → saison** (M4). C'est le lot à plus forte valeur
métier.

**Lot 3 — la valeur du parc.** Churn silencieux (M6), churn **en euros** (M7),
LTV par cohorte (M5), top comptes **nommés** (M16), CA par zone (M17).

**Lot 4 — l'abonnement.** Pénétration, revenu récurrent réel via
`orders.from_subscription_id`, et surtout le **taux de skip** (M15) — la donnée
est déjà là.

**Décisions produit à trancher avant tout chantier marge/cash :** ajouter un
`cost_cents` sur `OrderLine` (M19) et un modèle facture/encaissement (M22). Tant
que ces deux-là ne sont pas tranchés, la rentabilité et le DSO restent hors de
portée, quelle que soit la qualité du dashboard.
