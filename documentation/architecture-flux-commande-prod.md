# Flux commande → stock → plan de prod (0 always-on)

Principe : **rien ne tourne en continu**. Chaque brique est **toujours joignable**
mais **jamais allumée** — elle se réveille sur un déclencheur (requête HTTP,
webhook Shopify, ou horloge), traite, puis se rendort. Aucun serveur ne se paie à
l'idle.

```mermaid
flowchart TB
    client["🧑‍🍳 Client B2B<br/>(navigateur)"]
    shopify["🛍️ Shopify<br/>(canal de vente)"]
    cron["⏰ Cron ~20h<br/>(horloge Cloudflare)"]
    lab["🏭 Labo de prod<br/>(écran / app)"]

    subgraph cf["☁️ Cloudflare — tout wake-on-demand · 0 always-on"]
        pages["Storefront B2B<br/>Pages (statique)"]
        wOrder["Worker Commande<br/>⟵ requête HTTP"]
        wHook["Worker Webhook Shopify<br/>⟵ POST webhook + HMAC"]
        wCron["Worker Plan de prod<br/>⟵ cron (soir)"]
        wLab["Worker Labo<br/>⟵ requête HTTP"]
    end

    db[("🗄️ Postgres commerce<br/>commandes · stock · plan de prod")]
    pim["PIM (NestJS)<br/>vérité catalogue"]

    client -->|navigue| pages
    pages -->|POST /order| wOrder
    wOrder -->|écrit commande<br/>+ décrémente stock| db

    shopify -->|orders/create<br/>inventory_levels/update| wHook
    wHook -->|vérifie HMAC · dédup<br/>maj stock / commande| db

    cron --> wCron
    wCron -->|lit les commandes du jour| db
    wCron -->|écrit les qtés<br/>à produire demain| db

    lab -->|consulte le plan| wLab
    wLab -->|lit le plan de prod| db

    pim -.->|catalogue · prix| db
    db -.->|push stock vers le canal ?| shopify

    classDef ext fill:#fde68a,stroke:#b45309,color:#000
    classDef wrk fill:#bfdbfe,stroke:#1d4ed8,color:#000
    classDef data fill:#e9d5ff,stroke:#7c3aed,color:#000
    class client,shopify,cron,lab ext
    class pages,wOrder,wHook,wCron,wLab wrk
    class db,pim data
```

## Qui réveille qui

| Brique             | Déclencheur              | Fait quoi                                                  | Allumé ? |
| ------------------ | ------------------------ | --------------------------------------------------------- | -------- |
| Storefront (Pages) | —                        | sert le SPA statique                                       | non (CDN) |
| Worker Commande    | requête HTTP du client   | écrit la commande, décrémente le stock                    | **non**  |
| Worker Webhook     | POST webhook de Shopify  | vérifie HMAC, déduplique, met à jour stock/commande       | **non**  |
| Worker Plan de prod| cron (le soir)           | agrège les commandes du jour → qtés à produire demain     | **non**  |
| Worker Labo        | requête HTTP du labo     | lit et renvoie le plan de prod                            | **non**  |

## Les 4 garde-fous webhook (sinon stock faux)

1. **HMAC** — vérifier `X-Shopify-Hmac-Sha256` (sinon n'importe qui fausse le stock).
2. **Ack < 5 s** — répondre 200 vite ; boulot lourd → asynchrone (DB puis cron/queue).
3. **Idempotence** — at-least-once : dédupliquer par id d'évènement/commande (sinon double décompte).
4. **Pas d'ordre garanti** — préférer les **valeurs autoritaires** de Shopify aux deltas.

## Décisions encore ouvertes (à trancher avant de coder)

- **Source de vérité du stock** : Shopify (on mirror ses `inventory_levels`) **ou**
  notre système (Shopify = simple canal, on **pousse** le stock vers lui). Pour une
  boulangerie qui produit à la demande, le « stock » ≈ capacité à produire → penche
  pour « notre système est la vérité ».
- **Plan de prod : cron nightly (gratuit) vs Queues temps réel (~5 $/mois)**. « Pour
  demain » = batch → le cron suffit. Queues seulement si le labo veut un compteur live.
- **Où atterrissent les webhooks Shopify** : un nouveau Worker, **ou** le PIM NestJS
  existant (qui fait déjà la sync Shopify). Le pattern « webhook réveille un handler »
  marche dans les deux cas.

## Modèle de messagerie : point-to-point + batch, **pas** pub/sub

Choix acté : la communication entre briques se fait par **webhooks (push HTTP)**,
**Cloudflare Queues (file point-to-point + retry)** et **cron (pull/batch)** — et
**pas** par du pub/sub. Les 3 modèles :

| Modèle              | Qui → qui                                         | Ici                                        |
| ------------------- | ------------------------------------------------- | ------------------------------------------ |
| Point-to-point      | 1 producteur → cible(s) **connue(s)**, hand-off   | Shopify → endpoint ; Commande → Notif (Queue) |
| **Pub/sub**         | 1 producteur → **N abonnés inconnus**, broadcast  | **non retenu**                             |
| Pull / batch        | on **lit** un état partagé, personne ne pousse    | le cron du soir relit les commandes        |

**Pourquoi pas pub/sub :**

- Nos réactions sont **connues et peu nombreuses** (notifier, décrémenter stock,
  maj prod) — le découplage broadcast du pub/sub ne se rentabilise qu'avec
  **beaucoup d'abonnés évolutifs**, pas notre cas.
- Le pub/sub classique (Redis pub/sub, NATS, MQTT) impose un **broker always-on**
  → il **réintroduit le serveur allumé 24/7 qu'on fuit**. Webhook + Queue reste
  **serverless, sans broker**.
- Cloudflare n'a de toute façon pas de pub/sub broadcast GA : le « bus »
  serverless natif est **Queues** (une queue → **un** Worker consommateur), qui
  donne déjà **découplage + fiabilité + retry** sans broker.

**Si un jour un évènement doit déclencher N réactions** (imiter le fan-out sans
pub/sub) : enqueue dans **plusieurs queues** (une par réaction), **ou** un **Worker
dispatcher** qui appelle les handlers concernés, **ou** un seul consommateur qui
fait les N réactions.

## Panier — persistance & trajectoire

- **Maintenant (fait)** : le panier est un **brouillon client**, persisté en
  **localStorage réactif** (écrit à chaque mutation, ré-hydraté à l'init du
  singleton `CartService`). On ne persiste que la source de vérité `id→qty` ;
  prix/lignes/total sont dérivés et re-résolus. Survit reload / fermeture d'onglet
  / navigation. **Par appareil.** La `Order` (validée) est la seule chose en
  Postgres — jamais le brouillon.
- **📌 NOTE — avant launch, si voulu : « cart Redis » multi-appareil.** Le pattern
  des concurrents multi-plateformes = **cart serveur** (Redis actif → `Order` en
  DB au checkout) + **merge-on-login** du panier device dans le panier user.
  Choisir **Upstash Redis** (serverless, free tier, TTL, edge-compatible) — **pas**
  un Redis always-on. **Jamais** le brouillon en Postgres (churny → brûle
  ops/compute). La **surface de `CartService` ne change pas** : seule la couche
  persistance (localStorage → API cart) + l'étape merge-on-login. Décision : à
  trancher avant launch selon le besoin cross-device / 2ᵉ plateforme.

## Coût

- Chemin **tout Workers + cron** : **0 €** (Workers free + Cron Triggers gratuits).
- Ajouter **Queues** (temps réel) : **~5 $/mois** (Workers Paid).
- Aucune brique always-on à payer.
