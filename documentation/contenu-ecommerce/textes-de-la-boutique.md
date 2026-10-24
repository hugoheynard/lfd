# Les textes de la boutique

> **Généré** par `dev-toolbox/shop-copy-digest.mjs` depuis les dictionnaires de `apps/lfc-ecommerce-frontend/src/app/client/copy/`. **Ne pas éditer à la main** : régénérer par `pnpm copy:digest`. La porte `pnpm lint:shop-copy-digest` échoue si ce fichier ne correspond plus au code.
>
> La base de la reformulation (plan [`plan-textes-de-la-boutique.md`](plan-textes-de-la-boutique.md), §7 bis). Il dit le texte **du code**. `∅` : la clé manque dans cette langue ; `_(vide)_` : elle y vaut la chaîne vide.

## Sommaire — 1594 textes

Clés présentes dans une langue et absentes d'une autre : 0.

| Espace | Clé | Textes |
| --- | --- | --- |
| **Parcours de commande** | | |
| [Accueil public — le visiteur sans compte](#espace-accueilpublic) | `accueilPublic` | 61 |
| [Accueil pro public — le professionnel sans compte (/pro)](#espace-prolanding) | `proLanding` | 30 |
| [Les trois étapes du parcours (où, quand, quoi)](#espace-steps) | `steps` | 13 |
| [Accueil — l'en-tête de bienvenue](#espace-hero) | `hero` | 4 |
| [Accueil — les portes d'entrée](#espace-doors) | `doors` | 23 |
| [Accueil — la carte d'événement](#espace-event) | `event` | 5 |
| [Connexion et création de compte](#espace-signup) | `signup` | 24 |
| [Commander — l'écran d'entrée de la commande](#espace-commande) | `commande` | 39 |
| [Rayon / boutique](#espace-shop) | `shop` | 61 |
| [Rayon — la fiche produit](#espace-product) | `product` | 19 |
| [Barre de commande — la maison et l’heure retenues](#espace-commandterms) | `commandTerms` | 36 |
| [Choix du lieu — la maison](#espace-housepicker) | `housePicker` | 8 |
| [Choix du lieu et de l’heure — le dialogue commun](#espace-dialog) | `dialog` | 1 |
| [Choix du lieu — le retrait](#espace-pickupdialog) | `pickupDialog` | 11 |
| [Choix du lieu — l’adresse de livraison](#espace-addressdialog) | `addressDialog` | 24 |
| [Choix du lieu — la saisie d’une adresse de livraison](#espace-deliveryaddress) | `deliveryAddress` | 38 |
| [Choix de l’heure — le sélecteur de créneau](#espace-slotpicker) | `slotPicker` | 19 |
| [Choix de l’heure — l’étape du créneau](#espace-slotstep) | `slotStep` | 11 |
| [Choix de l’heure — le rappel téléphonique](#espace-rappel) | `rappel` | 12 |
| [Panier, connexion et saisie invité](#espace-cart) | `cart` | 57 |
| [Règlement](#espace-pay) | `pay` | 21 |
| [Confirmation](#espace-done) | `done` | 28 |
| [Confirmation — le QR de retrait](#espace-qr) | `qr` | 8 |
| **Le reste de la boutique** | | |
| [Le cadre — bandeaux, installation, erreurs générales](#espace-chrome) | `chrome` | 41 |
| [La navigation](#espace-nav) | `nav` | 24 |
| [La colonne d’accompagnement](#espace-aside) | `aside` | 4 |
| [Mes commandes (récapitulatif compris)](#espace-orders) | `orders` | 234 |
| [Annuler une commande — Mes commandes et la page invité](#espace-ordercancel) | `orderCancel` | 54 |
| [Fidélité](#espace-loyalty) | `loyalty` | 38 |
| [Mon compte (factures comprises)](#espace-account) | `account` | 525 |
| [Le compte pro — le dictionnaire général](#espace-pro) | `pro` | 8 |
| [Le compte pro — l’écran](#espace-proaccount) | `proAccount` | 27 |
| [La procédure de livraison d’une adresse](#espace-deliveryprocedure) | `deliveryProcedure` | 47 (+ 3 non recensé) |
| [Le dialogue « Nous écrire »](#espace-contactdialog) | `contactDialog` | 25 |
| [Les documents légaux](#espace-legaldocument) | `legalDocument` | 14 |
| **Total** | | **1594** |

## Le parcours de commande

<a id="espace-accueilpublic"></a>

### Accueil public — le visiteur sans compte — `accueilPublic`

Source : `screens/accueil-public.copy.ts` · 61 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `accueilPublic.kicker` | Bienvenue | Welcome | Benvenuti |  |
| `accueilPublic.screenTitle` | Commander.<br>Retirer.<br>Déguster. | Order.<br>Collect.<br>Enjoy. | Ordinare.<br>Ritirare.<br>Gustare. |  |
| `accueilPublic.lede` | Vous choisissez la maison et l’heure, on sort la fournée pour vous. Pas de compte à créer, pas de file le matin. | You pick the shop and the time, we pull the batch for you. No account to create, no queue in the morning. | Scegliete la bottega e l’ora, noi sforniamo per voi. Nessun account da creare, nessuna fila al mattino. |  |
| `accueilPublic.hello.kicker` | Nouvelle commande | New order | Nuovo ordine |  |
| `accueilPublic.hello.title` | Bonjour {name}.<br>On vous sert comment ? | Hello {name}.<br>How can we serve you? | Buongiorno {name}.<br>Come possiamo servirla ? | `{name}` |
| `accueilPublic.hello.titleAnonymous` | Bonjour.<br>On vous sert comment ? | Hello.<br>How can we serve you? | Buongiorno.<br>Come possiamo servirla ? |  |
| `accueilPublic.hello.lede` | Vous choisissez, nous préparons. Une seule question pour démarrer : vous venez, ou on vient ? | You choose, we bake. One question to start: are you coming, or are we? | Lei sceglie, noi prepariamo. Una sola domanda per iniziare : viene lei, o veniamo noi ? |  |
| `accueilPublic.hello.proPills.0` | Tarifs pro appliqués | Trade prices applied | Prezzi pro applicati |  |
| `accueilPublic.hello.proPills.1` | Livraison en station | Delivery in resort | Consegna in stazione |  |
| `accueilPublic.hello.proPills.2` | Facturation mensuelle | Monthly invoicing | Fatturazione mensile |  |
| `accueilPublic.doors.pickup.tag` | Retrait | Pickup | Ritiro |  |
| `accueilPublic.doors.pickup.title` | Je passe<br>la prendre | I’ll come<br>and get it | Passo<br>a prenderlo |  |
| `accueilPublic.doors.pickup.intro` | Au Labo ou au village, demain à l’heure de mon choix. | At Le Labo or Le Village, tomorrow at the time I choose. | Al Labo o al village, domani all’ora che scelgo. |  |
| `accueilPublic.doors.pickup.cta` | Choisir un point de retrait | Choose a pickup point | Scegliere un punto di ritiro |  |
| `accueilPublic.doors.pickup.note` | _(vide)_ | _(vide)_ | _(vide)_ |  |
| `accueilPublic.doors.courier.tag` | Coursier | Courier | Corriere |  |
| `accueilPublic.doors.courier.title` | On vous<br>l’apporte | We bring it<br>to you | Glielo<br>portiamo |  |
| `accueilPublic.doors.courier.intro` | Demain, au créneau que vous choisissez. | Tomorrow, in the slot you choose. | Domani, nella fascia che sceglie. |  |
| `accueilPublic.doors.courier.cta` | Choisir une adresse | Choose an address | Scegliere un indirizzo |  |
| `accueilPublic.doors.courier.note` | Avant 18 h | Before 6 pm | Entro le 18 |  |
| `accueilPublic.doors.courier.pending.tag` | Bientôt | Soon | Presto |  |
| `accueilPublic.doors.courier.pending.hint` | Votre dossier est en cours de validation — votre commercial ouvre la livraison dès qu’il est complet. | Your file is being reviewed — your account manager opens delivery as soon as it is complete. | Il suo fascicolo è in corso di validazione — il suo commerciale apre la consegna appena è completo. |  |
| `accueilPublic.doors.courierNotOffered.tag` | Indisponible | Unavailable | Non disponibile |  |
| `accueilPublic.doors.courierNotOffered.hint` | La livraison n’est pas proposée pour le moment. | Delivery is not offered at the moment. | La consegna non è proposta al momento. |  |
| `accueilPublic.doors.pickupUpTo` | Jusqu’à {value} | Up to {value} | Fino a {value} | `{value}` |
| `accueilPublic.hero.tag` | Nouvelle commande | New order | Nuovo ordine |  |
| `accueilPublic.hero.title` | Je passe la prendre | I’ll come and get it | Passo a prenderlo |  |
| `accueilPublic.hero.intro` | Choisissez votre maison — l’heure se choisit juste après, et la remise du retrait s’applique toute seule. | Pick your bakery — the time comes right after, and the pickup discount applies on its own. | Scegliete la vostra bottega — l’orario si sceglie subito dopo, e lo sconto del ritiro si applica da sé. |  |
| `accueilPublic.proof.discount` | −{value} | −{value} | −{value} | `{value}` |
| `accueilPublic.proof.discountLabel` | au retrait | on pickup | al ritiro |  |
| `accueilPublic.proof.opensLabel` | Première ouverture | Doors open | Prima apertura |  |
| `accueilPublic.houses.best` | Le plus avantageux | Best value | Il più vantaggioso |  |
| `accueilPublic.houses.choose` | Choisir | Choose | Scegli |  |
| `accueilPublic.houses.count` | {count} maisons | {count} bakeries | {count} botteghe | `{count}` |
| `accueilPublic.houses.scroll` | faites défiler | scroll to see more | scorrete |  |
| `accueilPublic.browse.helpLabel` | Bon à savoir | Good to know | Buono a sapersi |  |
| `accueilPublic.browse.lead` | Pas encore décidé ? | Not decided yet? | Non avete ancora deciso? |  |
| `accueilPublic.browse.strong` | Voyez d’abord les fournées | Look at today’s bakes first | Guardate prima le infornate |  |
| `accueilPublic.browse.tail` | — vous choisirez la maison et l’heure au moment du panier. | — you’ll pick the bakery and the time at checkout. | — sceglierete bottega e orario al momento del carrello. |  |
| `accueilPublic.browse.cta` | Je visite la boutique | Browse the shop | Visito la bottega |  |
| `accueilPublic.shortcuts.browseTitle` | Je visite la boutique | Browse the shop | Visito la bottega |  |
| `accueilPublic.shortcuts.browseSub` | Pour voir les produits et décider ensuite | To see the products and decide afterwards | Per vedere i prodotti e decidere dopo |  |
| `accueilPublic.shortcuts.againLead` | Ou reprenez | Or start again from | Oppure riprenda |  |
| `accueilPublic.shortcuts.againRecent` | Comme {day} dernier ? | Same as last {day}? | Come {day} scorso ? | `{day}` |
| `accueilPublic.shortcuts.againOlder` | Comme votre dernière commande ? | Same as your last order? | Come il suo ultimo ordine ? |  |
| `accueilPublic.shortcuts.againAction` | Refaire | Reorder | Rifare |  |
| `accueilPublic.shortcuts.againPickup` | retrait : {place} | pickup: {place} | ritiro : {place} | `{place}` |
| `accueilPublic.shortcuts.againDelivery` | en livraison | delivered | in consegna |  |
| `accueilPublic.shortcuts.againMore` | +{count} | +{count} | +{count} | `{count}` |
| `accueilPublic.shortcuts.againGone` | {count} article(s) de cette commande ne sont plus au rayon. Le reste est dans votre panier. | {count} item(s) from that order are no longer on the shelf. The rest is in your basket. | {count} articolo/i di quest’ordine non sono più in vendita. Il resto è nel suo carrello. | `{count}` |
| `accueilPublic.contact.call` | Appeler | Call | Chiamare |  |
| `accueilPublic.contact.write` | Écrire | Write | Scrivere |  |
| `accueilPublic.events.title` | En ce moment | Right now | In questo momento |  |
| `accueilPublic.events.lead` | Les opérations datées du fournil — commandables sans compte, avec leur propre délai. | Dated bakery offers — orderable without an account, each with its own lead time. | Le operazioni datate del forno — ordinabili senza account, ognuna col suo preavviso. |  |
| `accueilPublic.events.cta` | Voir le rayon | See the range | Vedi il reparto |  |
| `accueilPublic.empty.title` | Aucune maison ouverte | No bakery open | Nessuna bottega aperta |  |
| `accueilPublic.empty.subtitle` | Nous ne pouvons pas proposer de retrait pour l’instant. Revenez un peu plus tard. | We can’t offer pickup at the moment. Please come back a little later. | Al momento non possiamo offrire il ritiro. Tornate un po’ più tardi. |  |
| `accueilPublic.empty.deliverySubtitle` | Le retrait n’est pas proposé pour l’instant — nous pouvons vous livrer. | Pickup is not offered at the moment — we can deliver to you. | Al momento il ritiro non è proposto — possiamo consegnarvi. |  |
| `accueilPublic.empty.deliveryCta` | Me faire livrer | Have it delivered | Fatemelo consegnare |  |
| `accueilPublic.empty.noServiceTitle` | Commande indisponible | Ordering unavailable | Ordine non disponibile |  |
| `accueilPublic.empty.noServiceSubtitle` | Ni retrait ni livraison ne vous sont proposés pour l’instant. Appelez-nous, juste en dessous. | Neither pickup nor delivery is offered to you at the moment. Call us, just below. | Né ritiro né consegna vi sono proposti al momento. Chiamateci, qui sotto. |  |

<a id="espace-prolanding"></a>

### Accueil pro public — le professionnel sans compte (/pro) — `proLanding`

Source : `screens/pro-landing.copy.ts` · 30 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `proLanding.kicker` | Espace professionnel | Trade customers | Spazio professionisti |  |
| `proLanding.title` | Votre boulangerie<br>en station. | Your bakery<br>in the resort. | La vostra panetteria<br>in stazione. |  |
| `proLanding.lede` | Hôtels, restaurants, chalets : commandez au prix pro, retirez au point convenu ou faites-vous livrer sur les créneaux de votre contrat. | Hotels, restaurants, chalets: order at trade prices, collect at the agreed point or get deliveries on the slots of your contract. | Hotel, ristoranti, chalet: ordinate a prezzi pro, ritirate al punto concordato o ricevete le consegne negli orari del vostro contratto. |  |
| `proLanding.pills.0` | Tarifs pro | Trade prices | Prezzi pro |  |
| `proLanding.pills.1` | Livraison en station | Delivery in resort | Consegna in stazione |  |
| `proLanding.pills.2` | Facturation mensuelle | Monthly invoicing | Fatturazione mensile |  |
| `proLanding.signInLead` | Déjà inscrit ? | Already registered? | Già registrati? |  |
| `proLanding.signInPitch` | Retrouvez vos commandes, vos paniers récurrents et vos factures. | Find your orders, recurring baskets and invoices. | Ritrovate i vostri ordini, i carrelli ricorrenti e le fatture. |  |
| `proLanding.signIn` | Je me connecte | Sign in | Accedo |  |
| `proLanding.register` | Ouvrir un compte pro | Open a trade account | Aprire un conto pro |  |
| `proLanding.modesTitle` | Deux façons d’être servi | Two ways to be served | Due modi di essere serviti |  |
| `proLanding.pickup.tag` | Retrait | Pickup | Ritiro |  |
| `proLanding.pickup.title` | Je passe<br>la prendre | I’ll come<br>and get it | Passo<br>a prenderlo |  |
| `proLanding.pickup.intro` | Au point de retrait convenu avec votre commercial, prête à l’heure choisie. | At the pickup point agreed with your sales contact, ready at the time you choose. | Al punto di ritiro concordato con il vostro commerciale, pronto all’ora scelta. |  |
| `proLanding.pickup.note` | Point convenu | Agreed point | Punto concordato |  |
| `proLanding.pickup.signInLabel` | Se connecter pour commander en retrait | Sign in to order for pickup | Accedi per ordinare con ritiro |  |
| `proLanding.delivery.tag` | Livraison | Delivery | Consegna |  |
| `proLanding.delivery.title` | On vous<br>l’apporte | We bring<br>it to you | Ve lo<br>portiamo noi |  |
| `proLanding.delivery.intro` | Livrée à votre établissement, sur les créneaux fixés par votre contrat. | Delivered to your venue, on the slots set by your contract. | Consegnato al vostro locale, negli orari fissati dal contratto. |  |
| `proLanding.delivery.note` | Sous contrat | Under contract | Su contratto |  |
| `proLanding.delivery.signInLabel` | Se connecter pour commander en livraison | Sign in to order for delivery | Accedi per ordinare con consegna |  |
| `proLanding.pickupPoints.loading` | Points de retrait… | Pickup points… | Punti di ritiro… |  |
| `proLanding.pickupPoints.many` | {count} points de retrait | {count} pickup points | {count} punti di ritiro | `{count}` |
| `proLanding.pickupPoints.one` | Je retire à {place} | I collect at {place} | Ritiro a {place} | `{place}` |
| `proLanding.pickupPoints.discount` | Jusqu’à −{value} | Up to −{value} | Fino a −{value} | `{value}` |
| `proLanding.featured.title` | Nos incontournables | Our must-haves | I nostri imperdibili |  |
| `proLanding.featured.loading` | Incontournables… | Must-haves… | Imperdibili… |  |
| `proLanding.featured.signInLabel` | Se connecter pour voir le tarif de {name} | Sign in to see the price of {name} | Accedi per vedere il prezzo di {name} | `{name}` |
| `proLanding.browse` | Je visite la boutique | Browse the shop | Visito il negozio |  |
| `proLanding.contact` | Nous contacter | Contact us | Contattaci |  |

<a id="espace-steps"></a>

### Les trois étapes du parcours (où, quand, quoi) — `steps`

Source : `screens/steps.copy.ts` · 13 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `steps.where.label` | Où je la prends | Where I collect | Dove lo ritiro |  |
| `steps.where.hint` | La maison qui vous arrange | The bakery that suits you | La bottega che vi conviene |  |
| `steps.when.label` | À quelle heure | What time | A che ora |  |
| `steps.when.hint` | Les créneaux suivent les fournées | Slots follow the bakes | Gli orari seguono le infornate |  |
| `steps.what.label` | Ce que j’emporte | What I take | Cosa porto via |  |
| `steps.what.hint` | La boutique est ouverte | The shop is open | La bottega è aperta |  |
| `steps.doneLabel` | Étape franchie | Step completed | Passo completato |  |
| `steps.pro.where.label` | Je choisis mon acheminement | I choose how it travels | Scelgo il recapito |  |
| `steps.pro.where.hint` | Retrait ou coursier, on organise tout | Pickup or courier, we handle it | Ritiro o corriere, organizziamo tutto |  |
| `steps.pro.when.label` | Je choisis l’heure | I choose the time | Scelgo l’ora |  |
| `steps.pro.when.hint` | Libre au retrait, vos créneaux en livraison | Free for pickup, your windows for delivery | Libera al ritiro, i vostri orari in consegna |  |
| `steps.pro.what.label` | Je compose mon panier | I fill my basket | Compongo il carrello |  |
| `steps.pro.what.hint` | Tous les articles à prix pro | Every item at trade prices | Tutti gli articoli a prezzo pro |  |

<a id="espace-hero"></a>

### Accueil — l'en-tête de bienvenue — `hero`

Source : `fr.ts · en.ts · it.ts` · 4 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `hero.welcomeTitle` | Votre commande en station, réservée en deux minutes. | Your resort order, ready in two minutes. | Il tuo ordine in stazione, pronto in due minuti. |  |
| `hero.welcomeIntro` | Vous choisissez, nous préparons. | You choose, we prepare. | Tu scegli, noi prepariamo. |  |
| `hero.rappelTitle` | On vous rappelle quand ? | When shall we call ? | Quando ti richiamiamo ? |  |
| `hero.rappelIntro` | On appelle depuis le fournil, jamais depuis un centre. | We call from the bakery, never from a call centre. | Chiamiamo dal laboratorio, mai da un call center. |  |

<a id="espace-doors"></a>

### Accueil — les portes d'entrée — `doors`

Source : `fr.ts · en.ts · it.ts` · 23 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `doors.or` | ou | or | oppure |  |
| `doors.alreadyTitle` | Déjà client ? | Already a customer ? | Sei già cliente ? |  |
| `doors.alreadySub` | Un code par e-mail, un mot de passe ou Google | A code by email, a password or Google | Un codice via e-mail, una password o Google |  |
| `doors.emailCodeEntry` | Ouverture de la connexion par code… | Opening sign-in by code… | Apertura dell’accesso con codice… |  |
| `doors.signInFailedTitle` | La connexion n'a pas abouti | Sign-in did not go through | L’accesso non è riuscito |  |
| `doors.signInFailedSub` | Aucun code ni aucune session n'a été ouvert. Réessayez ; si le refus revient, transmettez-nous ce message. | No code was sent and no session was opened. Try again; if it fails again, send us this message. | Nessun codice inviato e nessuna sessione aperta. Riprova; se il rifiuto si ripete, inviaci questo messaggio. |  |
| `doors.signInCancelledTitle` | Connexion annulée | Sign-in cancelled | Accesso annullato |  |
| `doors.signInCancelledSub` | Vous n'êtes pas connecté. Vous pouvez recommencer quand vous voulez. | You are not signed in. You can start again whenever you like. | Non sei connesso. Puoi ricominciare quando vuoi. |  |
| `doors.invitationExpiredTitle` | Invitation expirée | Invitation expired | Invito scaduto |  |
| `doors.signInFailedBack` | Revenir à l'accueil | Back to home | Torna alla home |  |
| `doors.firstTitle` | Première visite ? | First time ? | Prima volta ? |  |
| `doors.firstSub` | Prénom, e-mail, téléphone | First name, email, phone | Nome, e-mail, telefono |  |
| `doors.signInLead` | Reprenez par le chemin que vous avez choisi en ouvrant votre compte. | Continue the way you chose when you opened your account. | Riprendi dal metodo che hai scelto aprendo il tuo account. |  |
| `doors.signInSubmit` | Recevoir un code | Get a code | Ricevi un codice |  |
| `doors.usePassword` | Utiliser un mot de passe | Use a password | Usa una password |  |
| `doors.switchLabel` | Type de compte | Account type | Tipo di account |  |
| `doors.persoLabel` | Particulier | Individual | Privato |  |
| `doors.persoSub` | Je commande pour moi | I order for myself | Ordino per me |  |
| `doors.proLabel` | Professionnel | Trade | Professionista |  |
| `doors.proSub` | Je commande pour mon établissement | I order for my venue | Ordino per il mio locale |  |
| `doors.toPersoLead` | Vous commandez pour vous ? | Ordering for yourself ? | Ordina per sé ? |  |
| `doors.toPersoLink` | Créer un compte particulier | Create a personal account | Creare un account privato |  |
| `doors.toProLead` | Vous commandez pour un établissement ? | Ordering for a venue ? | Ordina per un locale ? |  |

<a id="espace-event"></a>

### Accueil — la carte d'événement — `event`

Source : `fr.ts · en.ts · it.ts` · 5 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `event.badge` | Traiteur | Catering | Catering |  |
| `event.title` | Un event,<br>on prépare tout. | An event,<br>we handle it all. | Un evento,<br>pensiamo a tutto. |  |
| `event.pitch` | Séminaire, anniversaire, sortie de club : le nombre, l’heure, le lieu — on s’occupe du reste. | Seminar, birthday, club outing : the headcount, the time, the place — we do the rest. | Seminario, compleanno, uscita di club : il numero, l’ora, il luogo — al resto pensiamo noi. |  |
| `event.cta` | Un devis › | Get a quote › | Un preventivo › |  |
| `event.pending` | L’écran de demande de devis arrive au prochain lot — la carte est branchée, pas sa suite. | The quote request screen lands in the next batch — the card is wired, its sequel isn’t. | La schermata di richiesta preventivo arriva nel prossimo lotto — la scheda è collegata, il seguito no. |  |

<a id="espace-signup"></a>

### Connexion et création de compte — `signup`

Source : `fr.ts · en.ts · it.ts` · 24 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `signup.facebook` | Continuer avec Facebook | Continue with Facebook | Continua con Facebook |  |
| `signup.orEmail` | ou par e-mail | or by e-mail | oppure via e-mail |  |
| `signup.google` | Continuer avec Google | Continue with Google | Continua con Google |  |
| `signup.eyebrow` | Première visite ? 3 infos et c’est parti | First time ? 3 details and you’re in | Prima volta ? 3 informazioni e si parte |  |
| `signup.alreadyLead` | Déjà client ? | Already a customer ? | Sei già cliente ? |  |
| `signup.alreadyLink` | Se connecter | Sign in | Accedere |  |
| `signup.pitch` | Un prénom, un e-mail, un numéro. C’est tout — le reste attendra que vous en ayez besoin. | A first name, an email, a number. That’s all — the rest can wait until you need it. | Un nome, una e-mail, un numero. Tutto qui — il resto aspetterà che ti serva. |  |
| `signup.firstName` | Prénom | First name | Nome |  |
| `signup.firstNamePlaceholder` | Votre prénom | Your first name | Il tuo nome |  |
| `signup.tel` | Téléphone | Phone | Telefono |  |
| `signup.telPlaceholder` | 06 00 00 00 00 | 06 00 00 00 00 | 06 00 00 00 00 |  |
| `signup.email` | E-mail | Email | E-mail |  |
| `signup.emailPlaceholder` | vous@exemple.fr | you@example.com | tu@esempio.it |  |
| `signup.open` | S’inscrire | Sign up | Iscriviti |  |
| `signup.submit` | Créer mon compte | Create my account | Crea il mio account |  |
| `signup.fine` | Un code reçu par e-mail pour entrer, sans mot de passe à retenir. | A code sent by email to get in, no password to remember. | Un codice ricevuto via e-mail per entrare, nessuna password da ricordare. |  |
| `signup.fineInline` | Un code reçu par e-mail pour entrer, sans mot de passe à retenir. | A code sent by email to get in, no password to remember. | Un codice ricevuto via e-mail per entrare, nessuna password da ricordare. |  |
| `signup.legal` | En continuant, vous acceptez les conditions générales de vente et notre politique de données. Aucun paiement n’est demandé à l’inscription. | By continuing, you accept the terms of sale and our data policy. No payment is asked for at sign-up. | Continuando, accettate le condizioni generali di vendita e la nostra politica sui dati. Nessun pagamento è richiesto all’iscrizione. |  |
| `signup.loginPage.title` | Espace professionnel | Professional area | Area professionale |  |
| `signup.loginPage.lead` | Connectez-vous pour accéder à votre boutique, vos commandes et votre catalogue. | Sign in to reach your shop, your orders and your catalogue. | Accedi per raggiungere la tua boutique, i tuoi ordini e il tuo catalogo. |  |
| `signup.loginPage.checking` | Vérification de votre session… | Checking your session… | Verifica della sessione… |  |
| `signup.loginPage.signIn` | Se connecter | Sign in | Accedi |  |
| `signup.loginPage.signUp` | Créer un compte | Create an account | Crea un account |  |
| `signup.loginPage.hint` | Vous serez redirigé vers la page sécurisée, puis ramené ici. | You will be taken to the secure page, then brought back here. | Verrai indirizzato alla pagina sicura, poi riportato qui. |  |

<a id="espace-commande"></a>

### Commander — l'écran d'entrée de la commande — `commande`

Source : `fr.ts · en.ts · it.ts` · 39 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `commande.title` | Bonjour {name}.<br>On vous sert comment ? | Hello {name}.<br>How shall we serve you ? | Buongiorno {name}.<br>Come glielo serviamo ? | `{name}` |
| `commande.titleAnonymous` | Bonjour.<br>On vous sert comment ? | Hello.<br>How can we serve you? | Buongiorno.<br>Come la serviamo? |  |
| `commande.intro` | Vous choisissez, nous préparons. | You choose, we bake. | Lei sceglie, noi prepariamo. |  |
| `commande.sectionsLabel` | Sections | Sections | Sezioni |  |
| `commande.newOrderTitle` | Nouvelle commande | New order | Nuovo ordine |  |
| `commande.newOrderSub` | Une seule question pour démarrer : vous venez, ou on vient ? | One question to start with : do you come, or do we ? | Una sola domanda per iniziare : viene lei, o veniamo noi ? |  |
| `commande.nowTitle` | En ce moment | Right now | In questo momento |  |
| `commande.pickupBadge` | Retrait | Pickup | Ritiro |  |
| `commande.pickupTitle` | Je passe<br>la prendre | I’ll come<br>and get it | Passo io<br>a prenderlo |  |
| `commande.pickupDetail` | Au Labo ou dans une boutique de station. | At the Labo, or any of our resort shops. | Al Labo o in una delle botteghe della stazione. |  |
| `commande.pickupNote` | Demain à partir de 6 h | Tomorrow from 6 am | Domani dalle 6 |  |
| `commande.pickupDetailWide` | Au Labo ou au village, demain à l’heure de mon choix. | At the Labo or in the village, tomorrow at the hour I pick. | Al Labo o al villaggio, domani all’ora che scelgo io. |  |
| `commande.pickupCta` | Choisir un point de retrait | Choose a pickup point | Scegliere un punto di ritiro |  |
| `commande.pickupNoteWide` | Jusqu’à −{value} | Up to −{value} | Fino a −{value} | `{value}` |
| `commande.deliveryBadge` | Coursier | Courier | Corriere |  |
| `commande.deliveryTitle` | On vous<br>l’apporte | We bring it<br>to you | Glielo<br>portiamo noi |  |
| `commande.deliveryDetail` | Demain, au créneau que vous choisissez. | Tomorrow, in the time slot you pick. | Domani, nella fascia oraria che sceglie lei. |  |
| `commande.deliveryNote` | Commandez avant 18 h | Order before 6 pm | Ordini entro le 18 |  |
| `commande.deliveryDetailWide` | Demain, au créneau que vous choisissez. Deux adresses déjà enregistrées. | Tomorrow, in the slot you pick. Two addresses already saved. | Domani, nella fascia che sceglie lei. Due indirizzi già salvati. |  |
| `commande.deliveryCta` | Choisir une adresse | Choose an address | Scegliere un indirizzo |  |
| `commande.deliveryNoteWide` | Avant 18 h | Before 6 pm | Entro le 18 |  |
| `commande.eventBadge` | Noël | Christmas | Natale |  |
| `commande.eventTitle` | Noël se joue<br>au fournil | Christmas is made<br>at the bakehouse | Il Natale si gioca<br>al forno |  |
| `commande.eventDetail` | Deux bûches, un calendrier, les papillotes. | Two yule logs, a calendar, the papillotes. | Due tronchetti, un calendario, i papillotes. |  |
| `commande.eventNote` | 72 h de délai · J-18 | 72 h notice · D-18 | 72 h di preavviso · G-18 |  |
| `commande.cateringBadge` | Traiteur | Catering | Catering |  |
| `commande.cateringTitle` | Un event,<br>on prépare tout | An event,<br>we handle it all | Un evento,<br>pensiamo a tutto |  |
| `commande.cateringDetail` | Séminaire, anniversaire, sortie de club. | Seminar, birthday, club outing. | Seminario, compleanno, uscita di club. |  |
| `commande.cateringNote` | Réponse sous 24 h | Answer within 24 h | Risposta entro 24 h |  |
| `commande.browseTitle` | Je visite la boutique | Show me the shop | Visito la bottega |  |
| `commande.browseSub` | Pour voir les produits et décider ensuite | Browse the counter and decide afterwards | Per vedere i prodotti e decidere dopo |  |
| `commande.againTitle` | Comme samedi dernier ? | Same as last Saturday ? | Come sabato scorso ? |  |
| `commande.againSub` | 2 traditions, 4 croissants, 1 ski praliné · retrait au Labo | 2 traditions, 4 croissants, 1 praline ski · pickup at the Labo | 2 traditions, 4 croissant, 1 ski al pralinato · ritiro al Labo |  |
| `commande.againAction` | Refaire | Reorder | Rifare |  |
| `commande.againLead` | Ou reprenez | Or start again from | Oppure riprenda |  |
| `commande.urgenceTitle` | Une urgence, un ajout ? | Something urgent, something extra ? | Un’urgenza, un’aggiunta ? |  |
| `commande.urgencePitch` | Un oubli sur une commande en cours, une fournée à rallonger : ça se règle au téléphone. On dit rarement non. | A forgotten item on a running order, one more batch : the phone sorts it out. We rarely say no. | Una dimenticanza su un ordine in corso, una sfornata da allungare : si risolve al telefono. Diciamo di no di rado. |  |
| `commande.urgenceCta` | Être rappelé | Call me back | Farsi richiamare |  |
| `commande.pending` | La suite du parcours arrive au prochain lot — la carte est branchée, pas encore son écran. | The rest of the journey lands in the next batch — the card is wired, its screen is not. | Il seguito del percorso arriva nel prossimo lotto — la scheda è collegata, la sua schermata no. |  |

<a id="espace-shop"></a>

### Rayon / boutique — `shop`

Source : `fr.ts · en.ts · it.ts` · 61 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `shop.changeService` | Changer | Change | Cambia |  |
| `shop.pickService` | Où êtes-vous servi ? | Where are you served? | Dove viene servito? |  |
| `shop.pickServiceHint` | Le prix et l’heure en dépendent — dites-le avant de régler. | Price and time depend on it — say so before paying. | Prezzo e orario dipendono da questo — lo dica prima di pagare. |  |
| `shop.noService` | Nous ne pouvons pas vous servir pour l’instant : ni retrait ni livraison ne vous sont proposés. Appelez-nous, nous trouverons une solution. | We can’t serve you at the moment: neither pickup nor delivery is offered to you. Call us and we’ll find a way. | Al momento non possiamo servirla: né ritiro né consegna le sono proposti. Ci chiami, troveremo una soluzione. |  |
| `shop.loading` | Le rayon arrive… | Loading the shelves… | Il reparto sta arrivando… |  |
| `shop.loadFailedTitle` | La boutique n’a pas pu se charger | The shop could not load | La bottega non si è caricata |  |
| `shop.loadFailedHint` | Le réseau n’a pas répondu. Rien n’est perdu : votre panier vous attend. | The network did not answer. Nothing is lost — your basket is waiting. | La rete non ha risposto. Niente è perduto: il carrello ti aspetta. |  |
| `shop.loadRetry` | Réessayer | Try again | Riprova |  |
| `shop.pieceUnavailable` | Cet article n’est plus disponible | This item is no longer available | Questo articolo non è più disponibile |  |
| `shop.pieceUnavailableBack` | Voir la boutique | See the shop | Vedi la bottega |  |
| `shop.searchPlaceholder` | Chercher une baguette, un éclair… | Look for a baguette, an éclair… | Cerca una baguette, un éclair… |  |
| `shop.clearSearch` | Effacer la recherche | Clear the search | Cancella la ricerca |  |
| `shop.allShelves` | Tout | Everything | Tutto |  |
| `shop.allShelvesTitle` | Tout le rayon | The whole counter | Tutto il banco |  |
| `shop.resultsFor` | Résultats pour « {query} » | Results for “{query}” | Risultati per « {query} » | `{query}` |
| `shop.piecesUnit` | pièces | items | pezzi |  |
| `shop.emptyTitle` | Rien sous ce nom. | Nothing under that name. | Niente con questo nome. |  |
| `shop.emptyHint` | Essayez « pain », « tarte », ou touchez un rayon. | Try “bread”, “tart”, or tap a shelf. | Provi « pane », « torta », o tocchi un reparto. |  |
| `shop.openFeatureShelf` | Ouvrir le rayon | Open the shelf | Apri il reparto |  |
| `shop.slidePrevious` | Contenu précédent | Previous | Precedente |  |
| `shop.slideNext` | Contenu suivant | Next | Successivo |  |
| `shop.slideGoTo` | Contenu {n} sur {count} | Item {n} of {count} | Contenuto {n} di {count} | `{n}` `{count}` |
| `shop.shelvesGroup` | Les rayons | The shelves | I reparti |  |
| `shop.priceHt` | {price} HT | {price} excl. VAT | {price} IVA escl. | `{price}` |
| `shop.htSuffix` | HT | excl. VAT | IVA escl. |  |
| `shop.priceTtc` | {price} TTC | {price} incl. VAT | {price} IVA incl. | `{price}` |
| `shop.ttcSuffix` | TTC | incl. VAT | IVA incl. |  |
| `shop.proVisitNote` | Tarifs professionnels hors taxe — vos conditions négociées après connexion. | Trade prices excluding VAT — your negotiated terms once signed in. | Prezzi professionali IVA esclusa — le vostre condizioni negoziate dopo l’accesso. |  |
| `shop.proVisitSignIn` | Je me connecte | Sign in | Accedo |  |
| `shop.proVisitShowTtc` | Voir les prix TTC | Show prices incl. VAT | Vedi i prezzi IVA incl. |  |
| `shop.proVisitOrder` | Connectez-vous pour commander à vos conditions. | Sign in to order on your terms. | Accedete per ordinare alle vostre condizioni. |  |
| `shop.addAriaProVisit` | Se connecter pour commander {name} | Sign in to order {name} | Accedi per ordinare {name} | `{name}` |
| `shop.addAria` | Ajouter {name} | Add {name} | Aggiungi {name} | `{name}` |
| `shop.removeAria` | Retirer {name} | Remove {name} | Togli {name} | `{name}` |
| `shop.cartTitle` | Votre panier | Your basket | Il suo carrello |  |
| `shop.cartEmpty` | Panier vide. La fournée du matin part vite — le ski praliné ne fait jamais l’après-midi. | Empty basket. The morning batch goes fast — the praline ski never sees the afternoon. | Carrello vuoto. L’infornata del mattino va via in fretta — lo sci al pralinato non arriva mai al pomeriggio. |  |
| `shop.staffAdvice` | Notre conseil | Our advice | Il nostro consiglio |  |
| `shop.alsoLike` | Vous aimerez aussi | You may also like | Potrebbe piacerti anche |  |
| `shop.ourPicks` | Notre sélection | Our picks | La nostra selezione |  |
| `shop.boughtWith` | Souvent pris avec {name} | Often bought with {name} | Spesso preso con {name} | `{name}` |
| `shop.usuals` | Vos habituels | Your usuals | I vostri abituali |  |
| `shop.usualEvery.mon` | Tous les lundis | Every Monday | Ogni lunedì |  |
| `shop.usualEvery.tue` | Tous les mardis | Every Tuesday | Ogni martedì |  |
| `shop.usualEvery.wed` | Tous les mercredis | Every Wednesday | Ogni mercoledì |  |
| `shop.usualEvery.thu` | Tous les jeudis | Every Thursday | Ogni giovedì |  |
| `shop.usualEvery.fri` | Tous les vendredis | Every Friday | Ogni venerdì |  |
| `shop.usualEvery.sat` | Tous les samedis | Every Saturday | Ogni sabato |  |
| `shop.usualEvery.sun` | Tous les dimanches | Every Sunday | Ogni domenica |  |
| `shop.usualOrdered` | Commandé {count} fois | Ordered {count} times | Ordinato {count} volte | `{count}` |
| `shop.addedToCart` | Ajouté ! | Added! | Aggiunto! |  |
| `shop.operationOpensOn` | Ouvre le {date} | Opens {date} | Apre il {date} | `{date}` |
| `shop.operationNotOpen` | Pas encore ouvert | Not open yet | Non ancora aperto |  |
| `shop.operationClosed` | Commandes closes | Orders closed | Ordini chiusi |  |
| `shop.operationBadgeFrom` | Dès le {date} | From {date} | Dal {date} | `{date}` |
| `shop.operationBadgeDays` | J‑{days} | D‑{days} | G‑{days} | `{days}` |
| `shop.operationBadgeLastDay` | Dernier jour | Last day | Ultimo giorno |  |
| `shop.operationOrderFrom` | Commandes à partir du {date} | Orders open on {date} | Ordini a partire dal {date} | `{date}` |
| `shop.operationOrderUntil` | Commandez avant le {date} | Order before {date} | Ordinate entro il {date} | `{date}` |
| `shop.operationOrderUntilTime` | Commandez avant le {date} à {time} | Order before {date} at {time} | Ordinate entro il {date} alle {time} | `{date}` `{time}` |
| `shop.operationPickupWindow` | Retrait {span} | Collection {span} | Ritiro {span} | `{span}` |
| `shop.operationAwaitingProducts` | Les produits arrivent bientôt | Products are coming soon | I prodotti arrivano presto |  |

<a id="espace-product"></a>

### Rayon — la fiche produit — `product`

Source : `fr.ts · en.ts · it.ts` · 19 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `product.bestSeller` | Incontournable | Must-have | Imperdibile |  |
| `product.oven` | Fournée | Baked | Sfornata |  |
| `product.operationPickup` | Retrait | Collection | Ritiro |  |
| `product.operationPickupSpan` | du {from} au {until} | {from} to {until} | dal {from} al {until} | `{from}` `{until}` |
| `product.operationPickupDay` | le {day} | on {day} | il {day} | `{day}` |
| `product.perPiece` | / pièce | / piece | / pezzo |  |
| `product.proDiscount` | Prix pro −{pct} % | Trade price −{pct}% | Prezzo pro −{pct} % | `{pct}` |
| `product.batch` | × {n} | × {n} | × {n} | `{n}` |
| `product.batchAria` | {n} pièces | {n} pieces | {n} pezzi | `{n}` |
| `product.addCount` | Ajouter {n} | Add {n} | Aggiungi {n} | `{n}` |
| `product.update` | Mettre à jour | Update | Aggiorna |  |
| `product.inCart` | Déjà au panier | Already in basket | Già nel carrello |  |
| `product.signInToOrder` | Se connecter pour commander | Sign in to order | Accedi per ordinare |  |
| `product.madeToOrderDays` | Préparé sur commande — à commander {n} jours à l’avance, avant {time} | Made to order — order {n} days ahead, by {time} | Preparato su ordinazione — da ordinare {n} giorni prima, entro le {time} | `{n}` `{time}` |
| `product.madeToOrderEve` | Préparé sur commande — à commander la veille, avant {time} | Made to order — order the day before, by {time} | Preparato su ordinazione — da ordinare il giorno prima, entro le {time} | `{time}` |
| `product.madeToOrderSameDay` | Préparé sur commande — à commander le jour même, avant {time} | Made to order — order on the day, by {time} | Preparato su ordinazione — da ordinare in giornata, entro le {time} | `{time}` |
| `product.madeToOrderShortDays` | Sur commande · {n} jours avant {time} | Made to order · {n} days ahead, by {time} | Su ordinazione · {n} giorni prima, entro le {time} | `{n}` `{time}` |
| `product.madeToOrderShortEve` | Sur commande · la veille avant {time} | Made to order · day before, by {time} | Su ordinazione · il giorno prima, entro le {time} | `{time}` |
| `product.madeToOrderShortSameDay` | Sur commande · le jour même avant {time} | Made to order · same day, by {time} | Su ordinazione · in giornata, entro le {time} | `{time}` |

<a id="espace-commandterms"></a>

### Barre de commande — la maison et l’heure retenues — `commandTerms`

Source : `screens/command-terms.copy.ts` · 36 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `commandTerms.title` | Ma commande | My order | Il mio ordine |  |
| `commandTerms.today` | aujourd’hui | today | oggi |  |
| `commandTerms.tomorrow` | demain | tomorrow | domani |  |
| `commandTerms.changeHouse` | Changer de maison | Change bakery | Cambia bottega |  |
| `commandTerms.changeTime` | Changer l’heure | Change time | Cambia orario |  |
| `commandTerms.changeAddress` | Changer d’adresse | Change address | Cambia indirizzo |  |
| `commandTerms.changeDay` | Changer le jour | Change day | Cambia giorno |  |
| `commandTerms.lateDelivery` | Trop tard pour demain : votre commande sera livrée {day}. | Too late for tomorrow: your order will be delivered on {day}. | Troppo tardi per domani: il vostro ordine sarà consegnato {day}. | `{day}` |
| `commandTerms.latePickup` | Trop tard pour demain : votre commande sera à retirer {day}. | Too late for tomorrow: your order will be ready for pickup on {day}. | Troppo tardi per domani: il vostro ordine sarà da ritirare {day}. | `{day}` |
| `commandTerms.slipped` | Trop tard pour {day} : le premier jour encore possible est {next}. Changez le jour avant de régler. | Too late for {day}: the first day still open is {next}. Change the day before paying. | Troppo tardi per {day}: il primo giorno ancora possibile è {next}. Cambiate il giorno prima di pagare. | `{day}` `{next}` |
| `commandTerms.lateDeliveryAt` | Trop tard pour demain, la limite était {time} : votre commande sera livrée {day}. | Too late for tomorrow, orders closed at {time}: your order will be delivered on {day}. | Troppo tardi per domani, il limite era alle {time}: il vostro ordine sarà consegnato {day}. | `{time}` `{day}` |
| `commandTerms.latePickupAt` | Trop tard pour demain, la limite était {time} : votre commande sera à retirer {day}. | Too late for tomorrow, orders closed at {time}: your order will be ready for pickup on {day}. | Troppo tardi per domani, il limite era alle {time}: il vostro ordine sarà da ritirare {day}. | `{time}` `{day}` |
| `commandTerms.operationPickupFrom` | Ce produit se retire à partir du {day}. | This product can be picked up from {day}. | Questo prodotto si ritira a partire da {day}. | `{day}` |
| `commandTerms.cutoffCountdown` | Plus que {left} pour commander pour {day}. | Only {left} left to order for {day}. | Ancora {left} per ordinare per {day}. | `{left}` `{day}` |
| `commandTerms.cutoffLeftHoursMinutes` | {h} h {mm} | {h} h {mm} min | {h} h {mm} | `{h}` `{mm}` |
| `commandTerms.cutoffLeftHours` | {h} h | {h} h | {h} h | `{h}` |
| `commandTerms.cutoffLeftMinutes` | {m} min | {m} min | {m} min | `{m}` |
| `commandTerms.cutoffCalm` | Pour {day}, commandez avant {time}. | For {day}, order before {time}. | Per {day}, ordinate entro le {time}. | `{day}` `{time}` |
| `commandTerms.cutoffCountdownItem` | Plus que {left} pour commander un article de votre panier pour {day}. | Only {left} left to order an item in your basket for {day}. | Ancora {left} per ordinare un articolo del vostro carrello per {day}. | `{left}` `{day}` |
| `commandTerms.cutoffCalmItem` | Pour {day}, un article de votre panier se commande avant {time}. | For {day}, an item in your basket must be ordered before {time}. | Per {day}, un articolo del vostro carrello va ordinato entro le {time}. | `{day}` `{time}` |
| `commandTerms.itemTooLate` | Un article de votre panier : trop tard pour {day}, possible à partir de {next}. | An item in your basket: too late for {day}, available from {next}. | Un articolo del vostro carrello: troppo tardi per {day}, possibile da {next}. | `{day}` `{next}` |
| `commandTerms.itemTooLateOther` | 2 articles de votre panier : trop tard pour {day}, possible à partir de {next}. | 2 items in your basket: too late for {day}, available from {next}. | 2 articoli del vostro carrello: troppo tardi per {day}, possibile da {next}. | `{day}` `{next}` |
| `commandTerms.itemTooLateOthers` | {count} articles de votre panier : trop tard pour {day}, possible à partir de {next}. | {count} items in your basket: too late for {day}, available from {next}. | {count} articoli del vostro carrello: troppo tardi per {day}, possibile da {next}. | `{count}` `{day}` `{next}` |
| `commandTerms.modeTitle` | Retrait ou coursier ? | Pickup or courier? | Ritiro o corriere? |  |
| `commandTerms.close` | Fermer | Close | Chiudi |  |
| `commandTerms.pickup` | Retrait | Pickup | Ritiro |  |
| `commandTerms.delivery` | Livraison | Delivery | Consegna |  |
| `commandTerms.pieceOne` | {n} pièce | {n} piece | {n} pezzo | `{n}` |
| `commandTerms.pieceMany` | {n} pièces | {n} pieces | {n} pezzi | `{n}` |
| `commandTerms.discount` | −{amount} de remise | −{amount} discount | −{amount} di sconto | `{amount}` |
| `commandTerms.pay` | Régler | Pay | Paga |  |
| `commandTerms.empty` | Panier vide — ajoutez depuis le rayon | Empty basket — add from the shelf | Carrello vuoto — aggiungi dallo scaffale |  |
| `commandTerms.edit` | Modifier | Change | Modifica |  |
| `commandTerms.emptyShort` | Panier vide | Empty basket | Carrello vuoto |  |
| `commandTerms.unset` | Où et quand ? | Where and when? | Dove e quando? |  |
| `commandTerms.choose` | Choisir la maison et l’heure | Choose the bakery and time | Scegli la bottega e l’ora |  |

<a id="espace-housepicker"></a>

### Choix du lieu — la maison — `housePicker`

Source : `screens/house-picker.copy.ts` · 8 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `housePicker.kicker` | Étape 1 sur 3 | Step 1 of 3 | Passo 1 di 3 |  |
| `housePicker.title` | Où je la prends ? | Where do I collect? | Dove lo ritiro? |  |
| `housePicker.lead` | Changer de maison change les heures proposées — vous les choisirez juste après. | Changing bakery changes the times on offer — you will pick one right after. | Cambiare bottega cambia gli orari proposti — li sceglierete subito dopo. |  |
| `housePicker.current` | Votre choix | Your choice | La vostra scelta |  |
| `housePicker.readyFrom` | Prêt dès {hour} | Ready from {hour} | Pronto dalle {hour} | `{hour}` |
| `housePicker.cta` | Choisir mon heure | Choose my time | Scegliere il mio orario |  |
| `housePicker.ctaIdle` | Choisissez un point de retrait | Pick a pickup point | Scegliete un punto di ritiro |  |
| `housePicker.close` | Fermer | Close | Chiudi |  |

<a id="espace-dialog"></a>

### Choix du lieu et de l’heure — le dialogue commun — `dialog`

Source : `fr.ts · en.ts · it.ts` · 1 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `dialog.close` | Fermer | Close | Chiudere |  |

<a id="espace-pickupdialog"></a>

### Choix du lieu — le retrait — `pickupDialog`

Source : `fr.ts · en.ts · it.ts` · 11 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `pickupDialog.kicker` | Retrait | Pickup | Ritiro |  |
| `pickupDialog.title` | Vous venez où ? | Where are you coming ? | Dove passa a prenderlo ? |  |
| `pickupDialog.whenTitle` | Vous venez quand ? | When are you coming ? | Quando passa ? |  |
| `pickupDialog.lead` | On aime vous recevoir : retirez sur place et profitez d’une remise de {value} sur votre commande. | We like having you over : collect at the Labo and get {value} off your order. | Ci fa piacere riceverla : ritiri al Labo e approfitti di uno sconto del {value} sull’ordine. | `{value}` |
| `pickupDialog.habit` | votre habitude | your usual | la sua abitudine |  |
| `pickupDialog.readyFrom` | Prêt dès {time} | Ready from {time} | Pronto dalle {time} | `{time}` |
| `pickupDialog.discountTag` | −{value} sur tout | −{value} on everything | −{value} su tutto | `{value}` |
| `pickupDialog.discountTagSelection` | −{value} sur une sélection | −{value} on selected items | −{value} su una selezione | `{value}` |
| `pickupDialog.proPrice` | Prix pro | Trade price | Prezzo pro |  |
| `pickupDialog.shopPrice` | Prix boutique | Shop price | Prezzo bottega |  |
| `pickupDialog.cta` | Choisir mon heure | Pick my time | Scegliere l’ora |  |

<a id="espace-addressdialog"></a>

### Choix du lieu — l’adresse de livraison — `addressDialog`

Source : `fr.ts · en.ts · it.ts` · 24 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `addressDialog.kicker` | Coursier | Courier | Corriere |  |
| `addressDialog.title` | On livre où ? | Where do we deliver ? | Dove consegniamo ? |  |
| `addressDialog.bookGroup` | Vos adresses | Your addresses | I suoi indirizzi |  |
| `addressDialog.defaultTag` | Par défaut | Default | Predefinito |  |
| `addressDialog.otherGroup` | Une autre adresse | Another address | Un altro indirizzo |  |
| `addressDialog.street` | Rue | Street | Via |  |
| `addressDialog.streetPlaceholder` | 12 rue du Coin Ferrand | 12 rue du Coin Ferrand | 12 rue du Coin Ferrand |  |
| `addressDialog.postcode` | Code postal | Postcode | Codice postale |  |
| `addressDialog.postcodePlaceholder` | 73150 | 73150 | 73150 |  |
| `addressDialog.city` | Ville | Town | Città |  |
| `addressDialog.cityUnknown` | Se déduit du code postal | Derived from the postcode | Si deduce dal codice postale |  |
| `addressDialog.outOfZone` | Hors zone de livraison | Outside the delivery area | Fuori zona di consegna |  |
| `addressDialog.outOfZoneNote` | On ne descend pas encore jusque-là. Le retrait, lui, reste ouvert. | We don’t ride down that far yet. Pickup is still open to you. | Fin laggiù non scendiamo ancora. Il ritiro, invece, resta aperto. |  |
| `addressDialog.whoGroup` | Qui reçoit | Who receives it | Chi riceve |  |
| `addressDialog.name` | Nom | Name | Nome |  |
| `addressDialog.fromAccount` | Compte | Account | Account |  |
| `addressDialog.phone` | Téléphone | Phone | Telefono |  |
| `addressDialog.edit` | Modifier | Edit | Modificare |  |
| `addressDialog.whyPhone` | Prérempli depuis votre compte — le coursier appelle ce numéro s’il ne trouve pas la porte. | Prefilled from your account — the courier calls this number if the door hides. | Precompilato dal suo account — il corriere chiama questo numero se non trova la porta. |  |
| `addressDialog.saveToBook` | Enregistrer cette adresse au carnet | Save this address to my book | Salvare questo indirizzo in rubrica |  |
| `addressDialog.saveOn` | On la retrouvera à la prochaine commande. | We’ll have it ready next time. | Lo ritroveremo al prossimo ordine. |  |
| `addressDialog.saveOff` | Sinon, elle ne sert que pour cette commande. | Otherwise it only serves this order. | Altrimenti serve solo per questo ordine. |  |
| `addressDialog.cta` | Choisir mon créneau · {fee} € | Pick my slot · €{fee} | Scegliere la fascia · {fee} € | `{fee}` |
| `addressDialog.ctaBlocked` | Choisissez une adresse | Choose an address | Scelga un indirizzo |  |

<a id="espace-deliveryaddress"></a>

### Choix du lieu — la saisie d’une adresse de livraison — `deliveryAddress`

Source : `screens/delivery-address.copy.ts` · 38 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `deliveryAddress.kicker` | Coursier · étape 1 sur 2 | Courier · step 1 of 2 | Corriere · passo 1 di 2 |  |
| `deliveryAddress.title` | On livre où ? | Where do we deliver? | Dove consegniamo ? |  |
| `deliveryAddress.lead` | Les frais de coursier dépendent de la zone, jamais du contenu du panier — vous les voyez avant de composer. | Courier fees depend on the zone, never on what is in the basket — you see them before you shop. | Le spese del corriere dipendono dalla zona, mai dal contenuto del carrello — le vedete prima di comporre. |  |
| `deliveryAddress.defaultTag` | Par défaut | Default | Predefinito |  |
| `deliveryAddress.fee` | Frais · {fee} € | Fee · {fee} € | Spese · {fee} € | `{fee}` |
| `deliveryAddress.outOfZone` | Hors zone — le retrait, lui, reste ouvert. | Out of zone — pickup is still open. | Fuori zona — il ritiro resta aperto. |  |
| `deliveryAddress.window` | Livrée {window} | Delivered {window} | Consegnata {window} | `{window}` |
| `deliveryAddress.empty.title` | Aucune adresse au carnet | No address in the book | Nessun indirizzo in rubrica |  |
| `deliveryAddress.empty.subtitle` | Les adresses de livraison se règlent dans « Mon compte ». | Delivery addresses are managed in “My account”. | Gli indirizzi di consegna si impostano in « Il mio account ». |  |
| `deliveryAddress.free.title` | Votre adresse | Your address | Il vostro indirizzo |  |
| `deliveryAddress.free.lead` | Elle sert à cette commande. Les frais dépendent de la zone, jamais du contenu du panier. | It is used for this order. Fees depend on the zone, never on what is in the basket. | Serve per questo ordine. Le spese dipendono dalla zona, mai dal contenuto del carrello. |  |
| `deliveryAddress.free.ligne1` | Adresse | Address | Indirizzo |  |
| `deliveryAddress.free.ligne1Placeholder` | Numéro et rue | Number and street | Numero e via |  |
| `deliveryAddress.free.ligne2` | Complément | Extra details | Dettagli |  |
| `deliveryAddress.free.ligne2Placeholder` | Bâtiment, étage, digicode | Building, floor, door code | Edificio, piano, codice |  |
| `deliveryAddress.free.codePostal` | Code postal | Postcode | CAP |  |
| `deliveryAddress.free.codePostalPlaceholder` | 73150 | 73150 | 73150 |  |
| `deliveryAddress.free.ville` | Ville | Town | Città |  |
| `deliveryAddress.free.villePlaceholder` | Val d’Isère | Val d’Isère | Val d’Isère |  |
| `deliveryAddress.free.noZone` | Nous ne livrons pas encore ce code postal — le retrait, lui, reste ouvert. | We do not deliver to this postcode yet — pickup is still open. | Non consegniamo ancora a questo CAP — il ritiro resta aperto. |  |
| `deliveryAddress.day.label` | Jour de livraison | Delivery day | Giorno di consegna |  |
| `deliveryAddress.day.today` | Aujourd’hui | Today | Oggi |  |
| `deliveryAddress.day.tomorrow` | Demain | Tomorrow | Domani |  |
| `deliveryAddress.when.before` | avant | before | entro le |  |
| `deliveryAddress.when.deadline` | Livrée avant | Delivered before | Consegnata entro le |  |
| `deliveryAddress.when.deadlinePlaceholder` | Choisissez une heure | Pick a time | Scegliete un orario |  |
| `deliveryAddress.when.otherLabel` | Livrée avant (heure) | Delivered before (time) | Consegnata entro le (orario) |  |
| `deliveryAddress.when.slotStart` | Livrée à partir de | Delivered from | Consegnata dalle |  |
| `deliveryAddress.when.slotEnd` | Livrée avant | Delivered before | Consegnata entro le |  |
| `deliveryAddress.when.slot` | Créneau de livraison | Delivery slot | Fascia di consegna |  |
| `deliveryAddress.when.slotPlaceholder` | Choisissez un créneau | Pick a slot | Scegliete una fascia |  |
| `deliveryAddress.when.missingDeadline` | Une livraison se commande avec une heure : indiquez avant quelle heure livrer. | A delivery needs a time: say before when to deliver. | Una consegna si ordina con un orario: indicate entro che ora consegnare. |  |
| `deliveryAddress.when.missingSlot` | Une livraison se commande avec une heure : indiquez un créneau, début et fin. | A delivery needs a time: give a slot, start and end. | Una consegna si ordina con un orario: indicate una fascia, inizio e fine. |  |
| `deliveryAddress.when.missingBookSlot` | Une livraison se commande avec une heure : choisissez un de vos créneaux. | A delivery needs a time: pick one of your slots. | Una consegna si ordina con un orario: scegliete una delle vostre fasce. |  |
| `deliveryAddress.when.noneRegistered` | Aucune heure de livraison n’est inscrite sur cette adresse pour ce jour. Les heures se règlent avec votre commercial, dans « Mon compte » — le retrait, lui, reste ouvert. | No delivery time is set on this address for that day. Times are agreed with your sales contact, in “My account” — pickup is still open. | Nessun orario di consegna è registrato su questo indirizzo per quel giorno. Gli orari si concordano con il vostro commerciale, in « Il mio account » — il ritiro resta aperto. |  |
| `deliveryAddress.cta` | Composer mon panier · {fee} € | Fill my basket · {fee} € | Comporre il carrello · {fee} € | `{fee}` |
| `deliveryAddress.ctaIdle` | Choisissez une adresse | Pick an address | Scegliete un indirizzo |  |
| `deliveryAddress.close` | Fermer | Close | Chiudi |  |

<a id="espace-slotpicker"></a>

### Choix de l’heure — le sélecteur de créneau — `slotPicker`

Source : `screens/slot-picker.copy.ts` · 19 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `slotPicker.kicker` | Étape 2 sur 3 · {place} | Step 2 of 3 · {place} | Passo 2 di 3 · {place} | `{place}` |
| `slotPicker.title` | À quelle heure ? | What time? | A che ora? |  |
| `slotPicker.lead` | Les créneaux suivent les fournées. Celui que vous prenez décide de ce qui sera encore chaud. | Slots follow the bakes. The one you pick decides what will still be warm. | Gli orari seguono le infornate. Quello che scegliete decide cosa sarà ancora caldo. |  |
| `slotPicker.loading` | Nous regardons les fournées… | Checking the bakes… | Controlliamo le infornate… |  |
| `slotPicker.days.today` | Aujourd’hui | Today | Oggi |  |
| `slotPicker.days.tomorrow` | Demain | Tomorrow | Domani |  |
| `slotPicker.days.none` | Aucune journée ouverte | No day open | Nessuna giornata aperta |  |
| `slotPicker.state.open` | Ouvert | Open | Aperto |  |
| `slotPicker.state.full` | Complet | Full | Esaurito |  |
| `slotPicker.full.tag` | Complet | Full | Esaurito |  |
| `slotPicker.full.nextOpen` | Complet — il reste de la place à {time}. | Full — there is room at {time}. | Esaurito — c’è ancora posto alle {time}. | `{time}` |
| `slotPicker.full.noNext` | Complet — plus rien après cette heure-là. | Full — nothing left after this one. | Esaurito — non resta nulla dopo quest’ora. |  |
| `slotPicker.empty.title` | Aucun créneau ce jour-là | No slot that day | Nessun orario quel giorno |  |
| `slotPicker.empty.subtitle` | Cette maison ne propose pas de retrait ce jour. Essayez une autre journée. | This bakery offers no pickup that day. Try another one. | Questa bottega non propone il ritiro quel giorno. Provate un’altra giornata. |  |
| `slotPicker.cta` | Je prends {time} | I’ll take {time} | Prendo le {time} | `{time}` |
| `slotPicker.ctaIdle` | Choisissez un créneau | Pick a slot | Scegliete una fascia |  |
| `slotPicker.back` | Retour | Back | Indietro |  |
| `slotPicker.current` | Votre choix | Your choice | La vostra scelta |  |
| `slotPicker.close` | Fermer | Close | Chiudi |  |

<a id="espace-slotstep"></a>

### Choix de l’heure — l’étape du créneau — `slotStep`

Source : `fr.ts · en.ts · it.ts` · 11 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `slotStep.pickupIntro` | À retirer {place}. Le créneau vous garde la fournée. | To collect {place}. The slot keeps the batch for you. | Da ritirare {place}. La fascia le tiene la sfornata. | `{place}` |
| `slotStep.deliveryIntro` | Livré {place}. Le coursier part à l’ouverture du créneau. | Delivered {place}. The courier leaves as the slot opens. | Consegnato {place}. Il corriere parte all’apertura della fascia. | `{place}` |
| `slotStep.amGroup` | Matin · sortie de fournée | Morning · out of the oven | Mattina · appena sfornato |  |
| `slotStep.pmGroup` | Après-ski · seconde fournée | Après-ski · second batch | Après-ski · seconda sfornata |  |
| `slotStep.free` | ouvert | open | aperto |  |
| `slotStep.proOnly` | réservé aux pros | trade only | riservato ai professionisti |  |
| `slotStep.before` | avant | before | entro le |  |
| `slotStep.noneTitle` | Aucune heure déclarée | No hours declared | Nessun orario dichiarato |  |
| `slotStep.noneSubtitle` | Ce point n’a pas encore publié ses horaires. Appelez-nous, on vous cale. | This place hasn’t published its hours yet. Call us and we’ll sort it out. | Questo punto non ha ancora pubblicato gli orari. Ci chiami, troviamo la soluzione. |  |
| `slotStep.ctaIdle` | Choisissez un créneau | Pick a slot | Scelga una fascia |  |
| `slotStep.cta` | Remplir mon panier | Fill my basket | Riempire il carrello |  |

<a id="espace-rappel"></a>

### Choix de l’heure — le rappel téléphonique — `rappel`

Source : `fr.ts · en.ts · it.ts` · 12 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `rappel.asapGroup` | Dès que possible | As soon as possible | Prima possibile |  |
| `rappel.asapTitle` | Dans les 15 minutes | Within 15 minutes | Entro 15 minuti |  |
| `rappel.asapSub` | Le fournil décroche — c’est le plus rapide. | The bakery picks up — that’s the fastest. | Risponde il laboratorio — è la via più rapida. |  |
| `rappel.todayGroup` | Aujourd’hui | Today | Oggi |  |
| `rappel.note` | Entre 12 h et 14 h on est au four : on ne prend pas d’appel, et on préfère le dire. | Between noon and 2pm we’re at the oven : we don’t take calls, and we’d rather say so. | Tra le 12 e le 14 siamo al forno : non rispondiamo al telefono, e preferiamo dirlo. |  |
| `rappel.phone` | On vous rappellera au {phone}. | We’ll call you on {phone}. | Ti richiamiamo al {phone}. | `{phone}` |
| `rappel.phoneUnknown` | On vous rappelle au numéro de votre compte. | We call the number on your account. | La richiamiamo al numero del suo account. |  |
| `rappel.ctaIdle` | Choisissez un moment | Pick a time | Scegli un momento |  |
| `rappel.ctaReady` | Demander le rappel | Request the call | Richiedi il richiamo |  |
| `rappel.slotFree` | disponible | available | disponibile |  |
| `rappel.slotFull` | complet | full | esaurito |  |
| `rappel.slotOven` | au four | at the oven | al forno |  |

<a id="espace-cart"></a>

### Panier, connexion et saisie invité — `cart`

Source : `fr.ts · en.ts · it.ts` · 57 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `cart.kicker` | Le panier | The basket | Il carrello |  |
| `cart.title` | Votre commande | Your order | Il suo ordine |  |
| `cart.intro` | Relisez, ajustez, réglez. La fournée se cale sur votre créneau. | Read it over, adjust, pay. The batch follows your slot. | Rilegga, corregga, paghi. L’infornata segue la sua fascia oraria. |  |
| `cart.pickupGroup` | À retirer | To collect | Da ritirare |  |
| `cart.deliveryGroup` | À livrer | To deliver | Da consegnare |  |
| `cart.slotNote` | {day} · créneau choisi | {day} · chosen slot | {day} · fascia scelta | `{day}` |
| `cart.dayToday` | aujourd’hui | today | oggi |  |
| `cart.dayTomorrow` | demain | tomorrow | domani |  |
| `cart.changeService` | Modifier | Change | Modifica |  |
| `cart.subtotal` | Sous-total HT | Subtotal excl. VAT | Subtotale IVA escl. |  |
| `cart.discount` | Remise retrait {at} −{value} | Collection discount {at} −{value} | Sconto ritiro {at} −{value} | `{at}` `{value}` |
| `cart.discountOnBase` | Remise retrait {at} −{value} sur {base} éligibles | Collection discount {at} −{value} on {base} eligible | Sconto ritiro {at} −{value} su {base} idonei | `{at}` `{value}` `{base}` |
| `cart.excludedNote` | * Non concerné par la remise retrait. | * Not covered by the collection discount. | * Non coperto dallo sconto ritiro. |  |
| `cart.excludedLineAria` | {name}, non concerné par la remise retrait | {name}, not covered by the collection discount | {name}, non coperto dallo sconto ritiro | `{name}` |
| `cart.fee` | Coursier | Courier | Corriere |  |
| `cart.feeVatStandard` | TVA de la livraison : 20 % | Delivery VAT: 20% | IVA sulla consegna: 20 % |  |
| `cart.feeVatProrata` | TVA de la livraison : au prorata des produits | Delivery VAT: in proportion to the products | IVA sulla consegna: in proporzione ai prodotti |  |
| `cart.vat` | TVA {rate} | VAT {rate} | IVA {rate} | `{rate}` |
| `cart.total` | Total TTC | Total incl. VAT | Totale IVA incl. |  |
| `cart.totalPretax` | Total HT | Total excl. VAT | Totale IVA escl. |  |
| `cart.pretaxNote` | TVA et TTC sur la facture du mois | VAT and total incl. VAT on the monthly invoice | IVA e totale IVA inclusa sulla fattura del mese |  |
| `cart.pointsToEarn` | Vous gagnerez {n} points | You will earn {n} points | Guadagnerai {n} punti | `{n}` |
| `cart.voucherPick` | Utiliser un bon de fidélité | Use a loyalty voucher | Usa un buono fedeltà |  |
| `cart.voucherNone` | Aucun bon | No voucher | Nessun buono |  |
| `cart.voucherOption` | {value} HT — jusqu’au {date} | {value} excl. VAT — until {date} | {value} IVA esclusa — fino al {date} | `{value}` `{date}` |
| `cart.voucherLine` | Bon de fidélité | Loyalty voucher | Buono fedeltà |  |
| `cart.voucherHt` | {value} HT | {value} excl. VAT | {value} IVA esclusa | `{value}` |
| `cart.voucherRemainder` | Le reste, {value} HT, vous sera rendu en bon une fois la commande réglée. | The remaining {value} excl. VAT will be returned to you as a voucher once the order is paid. | Il resto, {value} IVA esclusa, ti sarà restituito in buono una volta saldato l’ordine. | `{value}` |
| `cart.voucherEffect` | soit −{value} sur votre total | i.e. −{value} off your total | cioè −{value} sul totale | `{value}` |
| `cart.voucherHtLine` | Bon de fidélité (HT) | Loyalty voucher (excl. VAT) | Buono fedeltà (IVA esclusa) |  |
| `cart.clear` | Vider le panier | Empty the basket | Svuota il carrello |  |
| `cart.payOnAccount` | Ajouter au compte | Charge to account | Addebita sul conto |  |
| `cart.accountSoon` | Le règlement au compte arrive au prochain lot — il attend votre condition de règlement. | Charging to account lands in the next batch — it is waiting on your payment term. | L’addebito sul conto arriva nel prossimo lotto — attende la vostra condizione di pagamento. |  |
| `cart.dropAria` | Retirer {name} du panier | Remove {name} from the basket | Rimuovi {name} dal carrello | `{name}` |
| `cart.pay` | Régler ma commande · {total} | Pay for my order · {total} | Pago il mio ordine · {total} | `{total}` |
| `cart.payHint` | Paiement en ligne. Vous présentez votre QR au comptoir, rien à régler sur place. | Paid online. You show your QR at the counter, nothing to settle there. | Pagamento online. Mostri il QR al banco, non deve saldare nulla sul posto. |  |
| `cart.slotMissing` | Choisissez un créneau pour régler : touchez « Modifier » et choisissez l’heure. | Choose a time slot to pay: tap “Change” and pick the time. | Scelga una fascia oraria per pagare: tocchi « Modifica » e scelga l’orario. |  |
| `cart.ordersClosed` | Les commandes sont fermées pour le moment. | Orders are closed for the moment. | Gli ordini sono chiusi per il momento. |  |
| `cart.settleTitle` | Comment réglez-vous ? | How are you paying? | Come pagate ? |  |
| `cart.settleCard` | Paiement direct | Pay now | Pagamento diretto |  |
| `cart.settleAccount` | Ajouter au compte | Add to the account | Aggiungi al conto |  |
| `cart.closeEmpty` | Fermer | Close | Chiudi |  |
| `cart.whoTitle` | Qui passe cette commande ? | Who is placing this order? | Chi effettua questo ordine? |  |
| `cart.whoHint` | Il nous faut un nom et une adresse pour vous envoyer votre QR de retrait. | We need a name and an address to send you your pickup QR. | Ci servono un nome e un indirizzo per inviarle il QR di ritiro. |  |
| `cart.whoRegister` | Je commande pour la première fois | This is my first order | È il mio primo ordine |  |
| `cart.whoGuestCta` | Commander en tant qu’invité | Order as a guest | Ordina come ospite |  |
| `cart.whoSignInCta` | Me connecter | Sign in | Accedi |  |
| `cart.whoSignIn` | J'ai déjà un compte | I already have an account | Ho già un account |  |
| `cart.back` | Retour à la boutique | Back to the shop | Torna alla bottega |  |
| `cart.guestFirstName` | Prénom | First name | Nome |  |
| `cart.guestFirstNameHint` | C’est le nom qu’on appellera au comptoir. | This is the name we will call at the counter. | È il nome che chiameremo al banco. |  |
| `cart.guestEmail` | Adresse e-mail | Email address | Indirizzo e-mail |  |
| `cart.guestEmailHint` | Votre confirmation et votre QR de retrait y arrivent. | Your confirmation and pickup QR land there. | La conferma e il QR di ritiro arrivano lì. |  |
| `cart.guestEmailAgain` | Confirmez votre adresse | Confirm your address | Confermi il suo indirizzo |  |
| `cart.guestEmailMismatch` | Les deux adresses ne sont pas identiques. | The two addresses are not the same. | I due indirizzi non coincidono. |  |
| `cart.guestPhone` | Téléphone | Phone | Telefono |  |
| `cart.guestPhoneHint` | Pour vous joindre si quelque chose cloche avec votre commande. | So we can reach you if something is wrong with your order. | Per contattarla se qualcosa non va con il suo ordine. |  |

<a id="espace-pay"></a>

### Règlement — `pay`

Source : `fr.ts · en.ts · it.ts` · 21 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `pay.title` | Il reste à régler. | One thing left: paying. | Resta da pagare. |  |
| `pay.lead` | Votre commande {ref} est enregistrée. Elle part en fabrication une fois réglée. | Your order {ref} is on file. It goes into production once paid. | Il suo ordine {ref} è registrato. Parte in produzione una volta pagato. | `{ref}` |
| `pay.amount` | Montant à régler | Amount due | Importo da pagare |  |
| `pay.loading` | Chargement du paiement sécurisé… | Loading secure payment… | Caricamento del pagamento sicuro… |  |
| `pay.submit` | Payer {total} | Pay {total} | Paga {total} | `{total}` |
| `pay.submitting` | Paiement… | Paying… | Pagamento… |  |
| `pay.abandon` | Abandonner ma commande | Abandon my order | Abbandona il mio ordine |  |
| `pay.abandonWarning` | Votre commande sera annulée. Rien n’a été débité. | Your order will be cancelled. Nothing has been charged. | Il suo ordine sarà annullato. Nulla è stato addebitato. |  |
| `pay.abandonWarningPro` | Rien ne sera débité. Sans règlement avant la fournée, la commande sera annulée. | Nothing will be charged. If it is not paid before the bake, the order will be cancelled. | Nulla sarà addebitato. Se non è pagato prima dell’infornata, l’ordine sarà annullato. |  |
| `pay.abandonConfirm` | Abandonner | Abandon | Abbandona |  |
| `pay.abandonKeep` | Garder ma commande | Keep my order | Tengo il mio ordine |  |
| `pay.abandonBusy` | Abandon… | Abandoning… | Abbandono… |  |
| `pay.abandoned` | Commande annulée. Rien n’a été débité. | Order cancelled. Nothing has been charged. | Ordine annullato. Nulla è stato addebitato. |  |
| `pay.abandonPending` | Votre commande n’est pas réglée. Rien n’a été débité ; elle sera annulée si elle n’est pas réglée avant la fournée. | Your order is not paid. Nothing has been charged; it will be cancelled if it is not paid before the bake. | Il suo ordine non è pagato. Nulla è stato addebitato; sarà annullato se non è pagato prima dell’infornata. |  |
| `pay.abandonSettled` | Votre paiement a été reçu : la commande n’est pas abandonnée. | Your payment was received: the order is not abandoned. | Il suo pagamento è stato ricevuto: l’ordine non è abbandonato. |  |
| `pay.closed` | Cette commande n’attend plus de paiement en ligne. Son état à jour est dans « Mes commandes ». | This order no longer awaits an online payment. Its current status is in “My orders”. | Questo ordine non attende più un pagamento online. Il suo stato aggiornato è in «I miei ordini». |  |
| `pay.closedAction` | Voir mes commandes | See my orders | Vedi i miei ordini |  |
| `pay.unavailable` | Le paiement est indisponible pour l’instant. Rien n’a été débité ; sans règlement avant la fournée, la commande sera annulée. | Payment is unavailable right now. Nothing has been charged; if it is not paid before the bake, the order will be cancelled. | Il pagamento non è disponibile al momento. Nulla è stato addebitato; se non è pagato prima dell’infornata, l’ordine sarà annullato. |  |
| `pay.refused` | Le paiement a été refusé. | The payment was declined. | Il pagamento è stato rifiutato. |  |
| `pay.failed` | Le paiement n’a pas pu être finalisé. | The payment could not be completed. | Il pagamento non è andato a buon fine. |  |
| `pay.accepted` | Paiement accepté. | Payment accepted. | Pagamento accettato. |  |

<a id="espace-done"></a>

### Confirmation — `done`

Source : `fr.ts · en.ts · it.ts` · 28 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `done.kicker` | Confirmée | Confirmed | Confermato |  |
| `done.title` | C’est réglé.<br>On s’y met à 4 h 15. | All paid.<br>We start at 4.15 am. | È pagato.<br>Si comincia alle 4.15. |  |
| `done.titleDue` | Commande enregistrée.<br>Il reste à la régler. | Order on file.<br>One thing left: paying. | Ordine registrato.<br>Resta da pagare. |  |
| `done.titleAccount` | Commande enregistrée.<br>Elle part sur votre compte. | Order on file.<br>It goes on your account. | Ordine registrato.<br>Va sul suo conto. |  |
| `done.intro` | Votre commande entre dans la fournée de demain matin. | Your order joins tomorrow morning’s batch. | Il suo ordine entra nell’infornata di domani mattina. |  |
| `done.keptTitle` | Gardée dans votre espace | Kept in your space | Conservato nel suo spazio |  |
| `done.keptLine` | Retrouvez-la, avec son QR de retrait, dans « Mes commandes ». | Find it again, with its collection QR, under “My orders”. | Lo ritrova, col suo QR di ritiro, in « I miei ordini ». |  |
| `done.guestMailTitle` | Votre QR de retrait arrive par e-mail | Your pickup QR is on its way by email | Il QR di ritiro arriva via e-mail |  |
| `done.guestMailLine` | Il part à l’adresse que vous avez donnée, avec le récapitulatif de votre commande. | It goes to the address you gave, with your order summary. | Parte all’indirizzo indicato, con il riepilogo dell’ordine. |  |
| `done.joinTitle` | Créez votre compte La Folie Coffee | Create your La Folie Coffee account | Create il vostro account La Folie Coffee |  |
| `done.joinLine` | Cumulez des points de fidélité à chaque commande, et retrouvez vos commandes et vos QR au même endroit. | Earn loyalty points on every order, and find your orders and QR codes in one place. | Accumulate punti fedeltà a ogni ordine, e ritrovate ordini e QR in un solo posto. |  |
| `done.joinBonusAndPoints` | Créez votre compte avec cette adresse : {bonus} points offerts, et cette commande vous rapportera {points} points {when}. | Create your account with this address: {bonus} points on us, and this order will earn you {points} points {when}. | Create il vostro account con questo indirizzo: {bonus} punti in omaggio, e questo ordine vi farà guadagnare {points} punti {when}. | `{bonus}` `{points}` `{when}` |
| `done.joinPointsOnly` | Créez votre compte avec cette adresse : cette commande vous rapportera {points} points {when}. | Create your account with this address: this order will earn you {points} points {when}. | Create il vostro account con questo indirizzo: questo ordine vi farà guadagnare {points} punti {when}. | `{points}` `{when}` |
| `done.joinBonusOnly` | Créez votre compte avec cette adresse : {bonus} points vous sont offerts. | Create your account with this address: {bonus} points are yours, on us. | Create il vostro account con questo indirizzo: {bonus} punti in omaggio per voi. | `{bonus}` |
| `done.joinOnceHandedOver` | une fois retirée | once collected | una volta ritirato |  |
| `done.joinOnceSettledAndHandedOver` | une fois réglée et retirée | once paid and collected | una volta pagato e ritirato |  |
| `done.joinAction` | Créer mon compte | Create my account | Crea il mio account |  |
| `done.recapPickup` | Retrait | Collection | Ritiro |  |
| `done.recapDelivery` | Livraison | Delivery | Consegna |  |
| `done.recapContent` | Contenu | Contents | Contenuto |  |
| `done.recapPieces` | {count} pièces | {count} items | {count} pezzi | `{count}` |
| `done.paidOnline` | Réglé en ligne | Paid online | Pagato online |  |
| `done.toSettle` | Reste à régler | Left to pay | Resta da pagare |  |
| `done.onAccount` | Porté à votre compte | Charged to your account | Addebitato sul conto |  |
| `done.onAccountPretax` | Porté à votre compte, HT | Charged to your account, excl. VAT | Addebitato sul conto, IVA escl. |  |
| `done.settleAction` | Régler maintenant | Pay now | Paga adesso |  |
| `done.qr` | Voir mon code de remise | View my handover code | Vedere il mio codice di consegna |  |
| `done.changeNote` | Un changement ? Appelez le fournil — une commande passée entre en fabrication. | Need a change? Call the bakery — a placed order goes into production. | Un cambiamento? Chiami il forno — un ordine inviato entra in produzione. |  |

<a id="espace-qr"></a>

### Confirmation — le QR de retrait — `qr`

Source : `fr.ts · en.ts · it.ts` · 8 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `qr.title` | Votre code de remise | Your handover code | Il suo codice di consegna |  |
| `qr.lead` | Présentez ce code. C’est le scan de l’équipe qui atteste la remise. | Show this code. The team’s scan is what records the handover. | Mostri questo codice. È la scansione del team che attesta la consegna. |  |
| `qr.loading` | Chargement… | Loading… | Caricamento… |  |
| `qr.codeLabel` | QR code de remise | Handover QR code | Codice QR di consegna |  |
| `qr.when` | Pour le {day} | For {day} | Per il {day} | `{day}` |
| `qr.unavailable` | Cette commande n’a pas de code : elle est antérieure au code de remise. | This order has no code: it predates the handover code. | Questo ordine non ha codice: è anteriore al codice di consegna. |  |
| `qr.unknown` | Cette commande est introuvable. | That order cannot be found. | Ordine non trovato. |  |
| `qr.due` | Cette commande n’est pas encore réglée. Son code de remise apparaît dès que le paiement est accepté. | This order is not paid yet. Its handover code appears as soon as the payment goes through. | Questo ordine non è ancora pagato. Il codice di consegna appare appena il pagamento è accettato. |  |

## Le reste de la boutique

<a id="espace-chrome"></a>

### Le cadre — bandeaux, installation, erreurs générales — `chrome`

Source : `fr.ts · en.ts · it.ts` · 41 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `chrome.identityConflict` | Un compte existe déjà avec cette adresse, ouvert par un autre moyen de connexion. Reprenez ce chemin : code par e-mail, mot de passe ou Google. | An account already uses this address, opened with another sign-in method. Take that path again: email code, password or Google. | Esiste già un account con questo indirizzo, aperto con un altro metodo di accesso. Riprendi quella strada: codice via e-mail, password o Google. |  |
| `chrome.identityConflictDismiss` | Compris | Got it | Ho capito |  |
| `chrome.installIosSafari` | Pour installer l'app : touchez Partager, puis « Sur l'écran d'accueil ». | To install the app: tap Share, then “Add to Home Screen”. | Per installare l'app: tocca Condividi, poi «Aggiungi alla schermata Home». |  |
| `chrome.installIosOther` | Ouvrez cette page dans Safari pour installer l'app. | Open this page in Safari to install the app. | Apri questa pagina in Safari per installare l'app. |  |
| `chrome.installPrompt` | Installer l'app | Install the app | Installa l'app |  |
| `chrome.installAction` | Installer | Install | Installa |  |
| `chrome.installLater` | Plus tard | Later | Più tardi |  |
| `chrome.back` | Retour | Back | Indietro |  |
| `chrome.menu` | Menu | Menu | Menu |  |
| `chrome.notifications` | Notifications | Notifications | Notifiche |  |
| `chrome.lang` | Langue | Language | Lingua |  |
| `chrome.signIn` | Se connecter | Sign in | Accedi |  |
| `chrome.createAccount` | Créer mon compte | Create my account | Crea il mio account |  |
| `chrome.kickerWelcome` | Bienvenue | Welcome | Benvenuto |  |
| `chrome.kickerRappel` | Rappel | Call back | Richiamo |  |
| `chrome.kickerCommande` | Nouvelle commande | New order | Nuovo ordine |  |
| `chrome.kickerShop` | Boutique | Shop | Bottega |  |
| `chrome.kickerCart` | Le panier | The basket | Il carrello |  |
| `chrome.kickerPay` | Règlement | Payment | Pagamento |  |
| `chrome.kickerQr` | Retrait | Collection | Ritiro |  |
| `chrome.kickerDone` | Confirmée | Confirmed | Confermato |  |
| `chrome.deskKicker` | Val d’Isère · commande en ligne | Val d’Isère · order online | Val d’Isère · ordina online |  |
| `chrome.brandLine` | Boulangerie · Val d’Isère | Bakery · Val d’Isère | Panetteria · Val d’Isère |  |
| `chrome.accountMenu` | Mon compte personnel | My personal account | Il mio account personale |  |
| `chrome.myProfile` | Mon profil | My profile | Il mio profilo |  |
| `chrome.workspaceChoice` | Espace de travail | Workspace | Spazio di lavoro |  |
| `chrome.workspacePersonal` | Perso | Personal | Personale |  |
| `chrome.workspaceCurrentPersonal` | Compte perso | Personal account | Account personale |  |
| `chrome.workspaceCurrentFor` | Vous travaillez pour | Working for | Lavori per |  |
| `chrome.workspaceSection` | Mes espaces | My workspaces | I miei spazi |  |
| `chrome.workspaceKindPro` | Pro | Pro | Pro |  |
| `chrome.workspaceKindPersonal` | Perso | Personal | Personale |  |
| `chrome.workspacePersonalNote` | Vos commandes à votre nom | Orders in your own name | Ordini a suo nome |  |
| `chrome.workspaceKindSite` | Site | Site | Sede |  |
| `chrome.workspaceVia` | via {name} | via {name} | tramite {name} | `{name}` |
| `chrome.workspaceRolePro` | Compte pro | Pro account | Account pro |  |
| `chrome.notificationsClose` | Fermer | Close | Chiudi |  |
| `chrome.notificationsCount` | {unread} non lues · {total} au total | {unread} unread · {total} in total | {unread} non lette · {total} in totale | `{unread}` `{total}` |
| `chrome.notificationsMarkAll` | Tout marquer comme lu | Mark all as read | Segna tutto come letto |  |
| `chrome.notificationsEmpty` | Rien à signaler. | Nothing to report. | Nulla da segnalare. |  |
| `chrome.cartOpen` | Voir mon panier | View my basket | Vedi il mio carrello |  |

<a id="espace-nav"></a>

### La navigation — `nav`

Source : `fr.ts · en.ts · it.ts` · 24 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `nav.destinations.shop` | Boutique | Shop | Negozio |  |
| `nav.destinations.orders` | Commandes | Orders | Ordini |  |
| `nav.destinations.invoices` | Factures | Invoices | Fatture |  |
| `nav.destinations.baskets` | Paniers récurrents | Recurring baskets | Carrelli ricorrenti |  |
| `nav.destinations.account` | Mon compte | My account | Il mio account |  |
| `nav.destinations.loyalty` | Ma fidélité | My loyalty | La mia fedeltà |  |
| `nav.invoicesDue` | {n} à régler | {n} to settle | {n} da saldare | `{n}` |
| `nav.basketsCount` | {n} modèles | {n} templates | {n} modelli | `{n}` |
| `nav.cart` | Mon panier | My basket | Il mio carrello |  |
| `nav.soon` | Bientôt | Soon | Presto |  |
| `nav.close` | Fermer le menu | Close the menu | Chiudi il menu |  |
| `nav.newOrder` | Nouvelle commande | New order | Nuovo ordine |  |
| `nav.newOrderSub` | Retrait ou coursier, vous choisissez | Pickup or courier, you choose | Ritiro o corriere, scegliete voi |  |
| `nav.house` | La maison | The bakery | La casa |  |
| `nav.houseLinks.0.0` | Nos rayons et nos méthodes | Our counters and our methods | I nostri banchi e i nostri metodi |  |
| `nav.houseLinks.0.1` | 6 fiches | 6 notes | 6 schede |  |
| `nav.houseLinks.1.0` | Le Labo — horaires et accès | Le Labo — hours and access | Le Labo — orari e accesso |  |
| `nav.houseLinks.1.1` | Ouvert | Open | Aperto |  |
| `nav.houseLinks.2.0` | Une urgence, un ajout ? | Something urgent to add? | Un imprevisto, un’aggiunta? |  |
| `nav.houseLinks.2.1` | Nous appeler | Call us | Chiamaci |  |
| `nav.logout` | Se déconnecter | Sign out | Esci |  |
| `nav.address` | Le Labo · route de la Balme, Val d’Isère — 7 h – 19 h | Le Labo · route de la Balme, Val d’Isère — 7 am – 7 pm | Le Labo · route de la Balme, Val d’Isère — 7 – 19 |  |
| `nav.hello` | Bonjour {name}. | Hello {name}. | Ciao {name}. | `{name}` |
| `nav.helloAnonymous` | Bonjour. | Hello. | Ciao. |  |

<a id="espace-aside"></a>

### La colonne d’accompagnement — `aside`

Source : `fr.ts · en.ts · it.ts` · 4 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `aside.proof.0` | Inscription rapide. | Quick sign-up. | Iscrizione rapida. |  |
| `aside.proof.1` | Votre espace évolue en fonction de vos besoins. | Your account grows with what you need. | Il tuo spazio cresce insieme alle tue esigenze. |  |
| `aside.proof.2` | Tarifs pro, livraison en station, facturation mensuelle sur demande. | Trade prices, resort delivery, monthly invoicing on request. | Prezzi professionali, consegna in stazione, fatturazione mensile su richiesta. |  |
| `aside.address` | Le Labo · Route de la Balme — ouvert de 7 h à 19 h. | Le Labo · Route de la Balme — open 7am to 7pm. | Le Labo · Route de la Balme — aperto dalle 7 alle 19. |  |

<a id="espace-orders"></a>

### Mes commandes (récapitulatif compris) — `orders`

Source : `screens/orders.copy.ts · screens/order-summary.copy.ts · screens/order-change-request.copy.ts` · 234 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `orders.title` | Mes commandes | My orders | I miei ordini |  |
| `orders.lead` | Ce qui est en route, puis tout ce qui est passé — avec son état de règlement. | What is on its way, then everything that is past — with how it was settled. | Quello che è in arrivo, poi tutto quello che è passato — con il suo stato di pagamento. |  |
| `orders.liveCount` | {n} suivis en cours | {n} orders in progress | {n} ordini in corso | `{n}` |
| `orders.wellHead` | Mes suivis | My tracking | I miei tracciamenti |  |
| `orders.wellHint` | {n} en cours | {n} in progress | {n} in corso | `{n}` |
| `orders.wellDot` | Aller au suivi {n} | Go to tracking {n} | Andare al tracciamento {n} | `{n}` |
| `orders.wellAll` | Toutes mes commandes | All my orders | Tutti i miei ordini |  |
| `orders.wellNone` | Rien en cours | Nothing in progress | Niente in corso |  |
| `orders.wellNoneHint` | Vos commandes vivantes s’affichent ici, du panier à la remise. | Live orders show up here, from basket to handover. | Gli ordini in corso compaiono qui, dal carrello alla consegna. |  |
| `orders.progress` | Avancement : {n} % | Progress: {n}% | Avanzamento: {n} % | `{n}` |
| `orders.qr` | Mon QR | My QR | Il mio QR |  |
| `orders.qrLong` | Mon QR de retrait | My pickup QR | Il mio QR di ritiro |  |
| `orders.qrSend` | Envoyer le QR | Send the QR | Inviare il QR |  |
| `orders.courierCall` | Contacter | Contact | Contattare |  |
| `orders.courierTrack` | Suivre en direct | Follow live | Seguire in diretta |  |
| `orders.courierOnWay` | {name} est en route | {name} is on the way | {name} è in arrivo | `{name}` |
| `orders.courierPending` | Coursier attribué au départ | Courier assigned on departure | Corriere assegnato alla partenza |  |
| `orders.historyHead` | Commandes passées | Past orders | Ordini passati |  |
| `orders.historyNote` | Un tableau, parce qu’ici on compare. | A table, because this is where you compare. | Una tabella, perché qui si confronta. |  |
| `orders.colOrder` | Commande | Order | Ordine |  |
| `orders.colMode` | Mode | Mode | Modalità |  |
| `orders.colDate` | Date | Date | Data |  |
| `orders.colStatus` | Statut | Status | Stato |  |
| `orders.colPayment` | Règlement | Settlement | Pagamento |  |
| `orders.colTotal` | Total | Total | Totale |  |
| `orders.colSite` | Site | Site | Sede |  |
| `orders.filterSite` | Site | Site | Sede |  |
| `orders.filterAllSites` | Tous les sites | All sites | Tutte le sedi |  |
| `orders.summary.filterFrom` | Du | From | Dal |  |
| `orders.summary.filterTo` | Au | To | Al |  |
| `orders.summary.filterClear` | Effacer les dates | Clear dates | Cancella le date |  |
| `orders.summary.filterUndated` | Les commandes sans date de retrait n’apparaissent pas. | Orders without a pickup date are not shown. | Gli ordini senza data di ritiro non compaiono. |  |
| `orders.summary.selectedMany` | {n} sélectionnées | {n} selected | {n} selezionati | `{n}` |
| `orders.summary.selectedOne` | 1 sélectionnée | 1 selected | 1 selezionato |  |
| `orders.summary.selectedNone` | Aucune sélectionnée | None selected | Nessuno selezionato |  |
| `orders.summary.capHint` | Jusqu’à {max} commandes par récapitulatif. | Up to {max} orders per summary. | Fino a {max} ordini per riepilogo. | `{max}` |
| `orders.summary.capExceeded` | Le récapitulatif porte au plus {max} commandes : retirez-en {extra}. | A summary covers at most {max} orders: remove {extra}. | Il riepilogo comprende al massimo {max} ordini: togline {extra}. | `{max}` `{extra}` |
| `orders.summary.selectAll` | Sélectionner toutes les commandes affichées | Select every order shown | Seleziona tutti gli ordini visualizzati |  |
| `orders.summary.selectRow` | Sélectionner la commande | Select the order | Seleziona l’ordine |  |
| `orders.summary.open` | Récapitulatif | Summary | Riepilogo |  |
| `orders.summary.title` | Récapitulatif | Summary | Riepilogo |  |
| `orders.summary.selection` | Sélection de {n} commandes | Selection of {n} orders | Selezione di {n} ordini | `{n}` |
| `orders.summary.periodBetween` | Retraits et livraisons du {from} au {to} | Pickups and deliveries from {from} to {to} | Ritiri e consegne dal {from} al {to} | `{from}` `{to}` |
| `orders.summary.periodFrom` | Retraits et livraisons à partir du {from} | Pickups and deliveries from {from} | Ritiri e consegne dal {from} | `{from}` |
| `orders.summary.periodTo` | Retraits et livraisons jusqu’au {to} | Pickups and deliveries until {to} | Ritiri e consegne fino al {to} | `{to}` |
| `orders.summary.loading` | Récapitulatif en cours… | Building the summary… | Riepilogo in corso… |  |
| `orders.summary.amountsNote` | Montants à la commande : remboursements et avoirs postérieurs non déduits. Le relevé comptable, ce sont les factures. | Amounts as ordered: later refunds and credit notes are not deducted. The accounting statement is the invoices. | Importi all’ordine: rimborsi e note di credito successivi non dedotti. Il rendiconto contabile sono le fatture. |  |
| `orders.summary.colProduct` | Produit | Product | Prodotto |  |
| `orders.summary.colSku` | SKU | SKU | SKU |  |
| `orders.summary.colQuantity` | Qté | Qty | Qtà |  |
| `orders.summary.colHt` | Total HT | Total excl. VAT | Totale IVA esclusa |  |
| `orders.summary.orderCountMany` | {n} commandes | {n} orders | {n} ordini | `{n}` |
| `orders.summary.orderCountOne` | 1 commande | 1 order | 1 ordine |  |
| `orders.summary.subtotal` | Sous-total HT | Subtotal excl. VAT | Subtotale IVA esclusa |  |
| `orders.summary.discount` | Remises | Discounts | Sconti |  |
| `orders.summary.voucher` | Bons de fidélité | Loyalty vouchers | Buoni fedeltà |  |
| `orders.summary.deliveryFee` | Livraison | Delivery | Consegna |  |
| `orders.summary.lateFee` | Surtaxes de commande tardive | Late order surcharges | Maggiorazioni per ordine tardivo |  |
| `orders.summary.vat` | TVA {rate} | VAT {rate} | IVA {rate} | `{rate}` |
| `orders.summary.unventilatedVat` | dont TVA non ventilée | of which VAT not broken down | di cui IVA non ripartita |  |
| `orders.summary.total` | Total TTC | Total incl. VAT | Totale IVA inclusa |  |
| `orders.summary.grandTotal` | Total général | Grand total | Totale generale |  |
| `orders.summary.noneCounted` | Aucune commande comptée dans cette sélection. | No order counted in this selection. | Nessun ordine conteggiato in questa selezione. |  |
| `orders.summary.excludedHead` | Commandes exclues des totaux | Orders left out of the totals | Ordini esclusi dai totali |  |
| `orders.summary.excludedCancelled` | annulée | cancelled | annullato |  |
| `orders.summary.excludedPending` | paiement en attente | payment pending | pagamento in attesa |  |
| `orders.summary.excludedFailed` | paiement refusé | payment refused | pagamento rifiutato |  |
| `orders.summary.pdf` | PDF | PDF | PDF |  |
| `orders.summary.csv` | Tableur | Spreadsheet | Foglio di calcolo |  |
| `orders.summary.failed` | Le récapitulatif n’a pas pu être établi. Réessayez dans un instant. | The summary could not be built. Try again in a moment. | Non è stato possibile preparare il riepilogo. Riprova tra un istante. |  |
| `orders.summary.exportFailed` | Le fichier n’a pas pu être produit. Réessayez dans un instant. | The file could not be produced. Try again in a moment. | Non è stato possibile produrre il file. Riprova tra un istante. |  |
| `orders.summary.ordersHead` | Bons de commande inclus | Order forms included | Buoni d’ordine inclusi |  |
| `orders.summary.ordersNote` | Montants HT tels que chaque bon les imprime — la TVA se calcule sur la facture. | Amounts excl. VAT as each order form prints them — VAT is worked out on the invoice. | Importi IVA esclusa come li stampa ogni buono — l’IVA si calcola in fattura. |  |
| `orders.summary.colOrder` | Bon | Order | Buono |  |
| `orders.summary.colDay` | Jour | Day | Giorno |  |
| `orders.summary.colMode` | Mode | Mode | Modalità |  |
| `orders.summary.colAuthor` | Auteur | Placed by | Autore |  |
| `orders.summary.modePickup` | Retrait | Pickup | Ritiro |  |
| `orders.summary.modeDelivery` | Livraison | Delivery | Consegna |  |
| `orders.summary.authorTeam` | l’équipe | our team | il nostro team |  |
| `orders.summary.undated` | sans date | no date | senza data |  |
| `orders.summary.ordersPretax` | Total HT des bons | Order forms total excl. VAT | Totale buoni IVA esclusa |  |
| `orders.summary.ordersGap` | Écart avec le sous-total HT : {causes} | Difference from the subtotal excl. VAT: {causes} | Differenza dal subtotale IVA esclusa: {causes} | `{causes}` |
| `orders.summary.gapDiscount` | remises | discounts | sconti |  |
| `orders.summary.gapVoucher` | bons de fidélité | loyalty vouchers | buoni fedeltà |  |
| `orders.summary.gapDelivery` | livraison | delivery | consegna |  |
| `orders.summary.gapLateFee` | surtaxes de commande tardive | late order surcharges | maggiorazioni per ordine tardivo |  |
| `orders.summary.gapCapped` | remise plafonnée au montant des articles | discount capped at the items amount | sconto limitato all’importo degli articoli |  |
| `orders.revision.reviseAction` | Modifier ma commande | Change my order | Modifica il mio ordine |  |
| `orders.revision.reviseCardNote` | Commande réglée par carte : pour la modifier, annulez-la et recommandez, ou demandez-nous. | Order paid by card: to change it, cancel it and order again, or ask us. | Ordine pagato con carta: per modificarlo, annullalo e ordina di nuovo, oppure chiedi a noi. |  |
| `orders.revision.reviseUntil` | Modifiable jusqu’au {when}. | Can be changed until {when}. | Modificabile fino al {when}. | `{when}` |
| `orders.revision.reviseWhen` | {day} à {time} | {day} at {time} | {day} alle {time} | `{day}` `{time}` |
| `orders.revision.refusedInPreparation` | Votre commande est déjà en préparation : elle ne se modifie plus. | Your order is already being prepared: it can no longer be changed. | Il tuo ordine è già in preparazione: non si può più modificare. |  |
| `orders.revision.refusedTooLate` | L’heure limite est passée : la commande ne se modifie plus en ligne. Contactez-nous. | The deadline has passed: the order can no longer be changed online. Contact us. | L’orario limite è passato: l’ordine non si può più modificare online. Contattaci. |  |
| `orders.revision.refusedTooLateUntil` | L’heure limite est passée : il était possible de la modifier jusqu’au {when}. Contactez-nous. | The deadline has passed: the order could be changed until {when}. Contact us. | L’orario limite è passato: era possibile modificarlo fino al {when}. Contattaci. | `{when}` |
| `orders.revision.refusedAccounting` | Cette commande est déjà facturée : elle ne se modifie plus en ligne. Contactez-nous. | This order has already been invoiced: it can no longer be changed online. Contact us. | Questo ordine è già stato fatturato: non si può più modificare online. Contattaci. |  |
| `orders.revision.refusedPaymentInProgress` | Un remboursement est en cours sur cette commande : réessayez dans quelques minutes. | A refund is in progress on this order: try again in a few minutes. | Un rimborso è in corso su questo ordine: riprova tra qualche minuto. |  |
| `orders.revision.refusedUnavailable` | Cette commande ne peut pas être modifiée en ligne. Contactez-nous. | This order cannot be changed online. Contact us. | Questo ordine non si può modificare online. Contattaci. |  |
| `orders.revision.reviseKicker` | Commande {reference} | Order {reference} | Ordine {reference} | `{reference}` |
| `orders.revision.reviseTitle` | Modifier ma commande | Change my order | Modifica il mio ordine |  |
| `orders.revision.reviseLead` | Changez les articles, les quantités, le jour ou le mode. Le nouveau total s’affiche avant de valider. | Change the items, the quantities, the day or the mode. The new total shows before you confirm. | Cambia gli articoli, le quantità, il giorno o la modalità. Il nuovo totale appare prima di confermare. |  |
| `orders.revision.loadingOrder` | Lecture de la commande… | Reading the order… | Lettura dell’ordine… |  |
| `orders.revision.loadFailedTitle` | La commande n’a pas pu être lue. | The order could not be read. | Non è stato possibile leggere l’ordine. |  |
| `orders.revision.reloadCta` | Recharger | Reload | Ricarica |  |
| `orders.revision.backToOrders` | Retour à mes commandes | Back to my orders | Torna ai miei ordini |  |
| `orders.revision.linesTitle` | Les articles | Items | Gli articoli |  |
| `orders.revision.addLabel` | Ajouter un article | Add an item | Aggiungi un articolo |  |
| `orders.revision.addPlaceholder` | Chercher dans la boutique | Search the shop | Cerca nel negozio |  |
| `orders.revision.addNone` | Aucun article | No item | Nessun articolo |  |
| `orders.revision.priceKept` | prix d’origine | original price | prezzo originale |  |
| `orders.revision.priceToday` | prix du jour | today’s price | prezzo del giorno |  |
| `orders.revision.removeAria` | Retirer {name} | Remove {name} | Rimuovi {name} | `{name}` |
| `orders.revision.noLinesNote` | Une commande garde au moins un article : pour tout retirer, annulez-la depuis Mes commandes. | An order keeps at least one item: to remove everything, cancel it from My orders. | Un ordine conserva almeno un articolo: per togliere tutto, annullalo da I miei ordini. |  |
| `orders.revision.serviceTitle` | Retrait ou livraison | Pickup or delivery | Ritiro o consegna |  |
| `orders.revision.servicePickup` | Retrait — {place} | Pickup — {place} | Ritiro — {place} | `{place}` |
| `orders.revision.serviceDelivery` | Livraison — {address} | Delivery — {address} | Consegna — {address} | `{address}` |
| `orders.revision.serviceWhen` | {day}, {slot} | {day}, {slot} | {day}, {slot} | `{day}` `{slot}` |
| `orders.revision.pickupToChoose` | Choisissez le point de retrait : la commande ne nous a pas permis de le retrouver. | Choose the pickup point: we could not find it from the order. | Scegli il punto di ritiro: non siamo riusciti a ritrovarlo dall’ordine. |  |
| `orders.revision.changeServiceCta` | Changer | Change | Cambia |  |
| `orders.revision.changeTimeCta` | Changer l’heure | Change the time | Cambia l’orario |  |
| `orders.revision.quoteTitle` | Le nouveau total | The new total | Il nuovo totale |  |
| `orders.revision.quotingMessage` | Calcul du nouveau total… | Working out the new total… | Calcolo del nuovo totale… |  |
| `orders.revision.quoteFailedNote` | Le nouveau total n’a pas pu être calculé. Réessayez dans un instant. | The new total could not be worked out. Try again in a moment. | Non è stato possibile calcolare il nuovo totale. Riprova tra un attimo. |  |
| `orders.revision.totalNew` | Nouveau total | New total | Nuovo totale |  |
| `orders.revision.totalPrevious` | Total actuel | Current total | Totale attuale |  |
| `orders.revision.differenceLabel` | Écart | Difference | Differenza |  |
| `orders.revision.differenceMore` | + {amount} | + {amount} | + {amount} | `{amount}` |
| `orders.revision.differenceLess` | − {amount} | − {amount} | − {amount} | `{amount}` |
| `orders.revision.differenceNone` | Aucun écart | No difference | Nessuna differenza |  |
| `orders.revision.taxIncluded` | TTC | incl. VAT | IVA inclusa |  |
| `orders.revision.unchangedNote` | Rien n’a encore changé. | Nothing has changed yet. | Non è ancora cambiato nulla. |  |
| `orders.revision.submitCta` | Valider la modification | Confirm the change | Conferma la modifica |  |
| `orders.revision.submittingCta` | Envoi… | Sending… | Invio… |  |
| `orders.revision.revisionRefused` | La modification n’a pas pu être enregistrée. | The change could not be saved. | Non è stato possibile registrare la modifica. |  |
| `orders.revision.revisedToast` | Votre commande est modifiée. | Your order has been changed. | Il tuo ordine è stato modificato. |  |
| `orders.revision.request.requestAction` | Demander une modification | Request a change | Chiedi una modifica |  |
| `orders.revision.request.requestNote` | L’heure limite ({when}) est passée : vous pouvez encore nous demander une modification, notre équipe vous répond par e-mail. | The deadline ({when}) has passed: you can still ask us for a change, our team will reply by email. | L’orario limite ({when}) è passato: puoi ancora chiederci una modifica, il nostro team ti risponde via e-mail. | `{when}` |
| `orders.revision.request.requestNoteWithoutWhen` | L’heure limite est passée : vous pouvez encore nous demander une modification, notre équipe vous répond par e-mail. | The deadline has passed: you can still ask us for a change, our team will reply by email. | L’orario limite è passato: puoi ancora chiederci una modifica, il nostro team ti risponde via e-mail. |  |
| `orders.revision.request.requestPendingNote` | Modification demandée — en attente de notre réponse. | Change requested — awaiting our reply. | Modifica richiesta — in attesa della nostra risposta. |  |
| `orders.revision.request.requestAppliedNote` | Votre demande de modification a été acceptée : la commande ci-dessus est à jour. | Your change request was accepted: the order above is up to date. | La tua richiesta di modifica è stata accettata: l’ordine qui sopra è aggiornato. |  |
| `orders.revision.request.requestRefusedNote` | Votre demande de modification n’a pas pu être acceptée : « {reason} » | Your change request could not be accepted: “{reason}” | La tua richiesta di modifica non è stata accettata: «{reason}» | `{reason}` |
| `orders.revision.request.requestTitle` | Demander une modification | Request a change | Chiedi una modifica |  |
| `orders.revision.request.requestLead` | L’heure limite est passée : composez la commande voulue, notre équipe l’examine et vous répond par e-mail. | The deadline has passed: put together the order you want, our team will review it and reply by email. | L’orario limite è passato: componi l’ordine che desideri, il nostro team lo esamina e ti risponde via e-mail. |  |
| `orders.revision.request.requestSendTitle` | Votre demande | Your request | La tua richiesta |  |
| `orders.revision.request.requestSendNote` | Rien ne change tant que notre équipe n’a pas répondu. Si elle accepte, le nouveau total vous est confirmé par e-mail. | Nothing changes until our team has replied. If they accept, the new total is confirmed by email. | Nulla cambia finché il nostro team non ha risposto. Se accetta, il nuovo totale ti viene confermato via e-mail. |  |
| `orders.revision.request.requestQuoteIndicative` | Montant indicatif, sous réserve d’acceptation par notre équipe ; le montant appliqué peut différer si les prix changent d’ici là. | Indicative amount, subject to acceptance by our team; the amount applied may differ if prices change in the meantime. | Importo indicativo, soggetto all’accettazione del nostro team; l’importo applicato può variare se nel frattempo i prezzi cambiano. |  |
| `orders.revision.request.requestMessageLabel` | Un mot pour notre équipe (facultatif) | A word for our team (optional) | Una parola per il nostro team (facoltativa) |  |
| `orders.revision.request.requestMessagePlaceholder` | Par exemple : une personne de plus au déjeuner. | For example: one more person at lunch. | Per esempio: una persona in più a pranzo. |  |
| `orders.revision.request.requestSubmitCta` | Demander cette modification | Request this change | Chiedi questa modifica |  |
| `orders.revision.request.requestSubmittingCta` | Envoi… | Sending… | Invio… |  |
| `orders.revision.request.requestRefused` | La demande n’a pas pu être envoyée. | The request could not be sent. | Non è stato possibile inviare la richiesta. |  |
| `orders.revision.request.requestSentToast` | Demande envoyée : nous vous répondons par e-mail. | Request sent: we will reply by email. | Richiesta inviata: ti rispondiamo via e-mail. |  |
| `orders.authorCustomer` | passée par {name} | placed by {name} | effettuato da {name} | `{name}` |
| `orders.authorTeam` | par l’équipe | by our team | dal nostro team |  |
| `orders.detailSite` | Site | Site | Sede |  |
| `orders.pieces` | {n} art. | {n} items | {n} art. | `{n}` |
| `orders.modePickup` | Retrait | Collection | Ritiro |  |
| `orders.modeDelivery` | Coursier | Courier | Corriere |  |
| `orders.stepPlaced` | Panier validé | Basket confirmed | Carrello confermato |  |
| `orders.stepBakery` | Au fournil | In the bakehouse | In forno |  |
| `orders.stepReady` | Prête | Ready | Pronta |  |
| `orders.stepHandedPickup` | Retirée | Collected | Ritirata |  |
| `orders.stepHandedDelivery` | Livrée | Delivered | Consegnata |  |
| `orders.qrReady` | Votre QR est prêt — présentez-le au comptoir | Your QR is ready — show it at the counter | Il suo QR è pronto — lo mostri al banco |  |
| `orders.noWindow` | Aucune tranche demandée | No time slot requested | Nessuna fascia richiesta |  |
| `orders.before` | avant | before | entro le |  |
| `orders.statusCancelled` | Annulée | Cancelled | Annullata |  |
| `orders.emptyOrders` | Aucune commande pour l’instant. | No orders yet. | Nessun ordine per ora. |  |
| `orders.statusReceived` | Enregistrée | Registered | Registrata |  |
| `orders.statusBakery` | Au fournil | In the bakehouse | In forno |  |
| `orders.statusReady` | Prête | Ready | Pronto |  |
| `orders.statusRoute` | En route | On the way | In viaggio |  |
| `orders.statusDone` | Retirée | Collected | Ritirato |  |
| `orders.statusDelivered` | Livrée | Delivered | Consegnato |  |
| `orders.payAccount` | Au compte | On account | Sul conto |  |
| `orders.payCard` | Réglée · CB | Paid · card | Pagato · carta |  |
| `orders.payDue` | À régler | To pay | Da pagare |  |
| `orders.payRefused` | Paiement refusé | Payment declined | Pagamento rifiutato |  |
| `orders.payAccountNote` | portée à la facture du mois, avec la TVA et le TTC | carried to the monthly invoice, with VAT and the total incl. VAT | riportato sulla fattura del mese, con IVA e totale IVA inclusa |  |
| `orders.totalPretax` | HT | excl. VAT | IVA escl. |  |
| `orders.payCardNote` | réglée à la commande | paid at checkout | pagato all’ordine |  |
| `orders.payDueNote` | le paiement par carte n’a pas abouti | the card payment did not go through | il pagamento con carta non è andato a buon fine |  |
| `orders.payRefusedNote` | votre banque a refusé la carte | your bank declined the card | la tua banca ha rifiutato la carta |  |
| `orders.settle` | Régler | Pay | Paga |  |
| `orders.detailRefund` | Remboursement | Refund | Rimborso |  |
| `orders.detailPickupDiscount` | Remise retrait | Collection discount | Sconto ritiro |  |
| `orders.detailPickupDiscountValue` | −{value} sur {base} éligibles | −{value} on {base} eligible | −{value} su {base} idonei | `{value}` `{base}` |
| `orders.detailPickupExcluded` | Non concernés par la remise retrait | Not covered by the collection discount | Non coperti dallo sconto ritiro |  |
| `orders.refundedFull` | Remboursée | Refunded | Rimborsato |  |
| `orders.refundedPartial` | Remboursée en partie ({amount}) | Partly refunded ({amount}) | Rimborsato in parte ({amount}) | `{amount}` |
| `orders.detailHead` | Le détail | The detail | Il dettaglio |  |
| `orders.detailSlot` | Créneau | Slot | Fascia oraria |  |
| `orders.detailPayment` | Règlement | Settlement | Pagamento |  |
| `orders.detailOrigin` | Origine | Origin | Origine |  |
| `orders.originRecurring` | Panier récurrent | Recurring basket | Carrello ricorrente |  |
| `orders.originPhone` | Prise par La Folie Coffee | Taken by La Folie Coffee | Presa da La Folie Coffee |  |
| `orders.detailMode` | Mode | Mode | Modalità |  |
| `orders.purchaseOrder` | Bon de commande | Order form | Buono d’ordine |  |
| `orders.purchaseOrderFailed` | Le bon de commande n’a pas pu être téléchargé. Réessayez dans un instant. | The order form could not be downloaded. Please try again in a moment. | Non è stato possibile scaricare il buono d’ordine. Riprova tra un istante. |  |
| `orders.deliveryNote` | Bon de livraison | Delivery note | Documento di trasporto |  |
| `orders.deliveryNoteFailed` | Le bon de livraison n’a pas pu être téléchargé. Réessayez dans un instant. | The delivery note could not be downloaded. Please try again in a moment. | Non è stato possibile scaricare il documento di trasporto. Riprova tra un istante. |  |
| `orders.reorder` | Recommander à l’identique | Order the same again | Riordinare identico |  |
| `orders.problem` | Un problème sur cette commande | A problem with this order | Un problema su questo ordine |  |
| `orders.expand` | Déplier la commande | Expand the order | Aprire l’ordine |  |
| `orders.collapse` | Replier la commande | Collapse the order | Chiudere l’ordine |  |
| `orders.rateIdle` | Notez cette commande | Rate this order | Valuta questo ordine |  |
| `orders.rateHigh` | Merci — c’est noté. | Thank you — noted. | Grazie — preso nota. |  |
| `orders.rateLow` | Merci, on regarde ça. | Thank you, we’ll look into it. | Grazie, ci guardiamo. |  |
| `orders.rateStar` | Mettre {n} sur 5 | Give {n} out of 5 | Dare {n} su 5 | `{n}` |
| `orders.reportKicker` | Commande | Order | Ordine |  |
| `orders.reportTitle` | Signaler un problème | Report a problem | Segnalare un problema |  |
| `orders.reportLead` | Dites-nous ce qui s’est passé. On répond dans la journée, et on remet la pièce sur la prochaine commande quand c’est de notre fait. | Tell us what happened. We answer the same day, and we put the item back on your next order when it is on us. | Diteci che cosa è successo. Rispondiamo in giornata e rimettiamo il pezzo sul prossimo ordine quando dipende da noi. |  |
| `orders.reasonHead` | La raison | The reason | Il motivo |  |
| `orders.reasonPlaceholder` | Choisir une raison | Choose a reason | Scegliere un motivo |  |
| `orders.photoRemaining` | Jusqu’à {n} photo(s) de plus — JPEG, PNG ou WebP, 5 Mo chacune. | Up to {n} more photo(s) — JPEG, PNG or WebP, 5 MB each. | Fino a {n} foto in più — JPEG, PNG o WebP, 5 MB ciascuna. | `{n}` |
| `orders.photoRemove` | Retirer {name} | Remove {name} | Togliere {name} | `{name}` |
| `orders.photoBadType` | « {name} » n’est pas une photo JPEG, PNG ou WebP. | “{name}” is not a JPEG, PNG or WebP photo. | «{name}» non è una foto JPEG, PNG o WebP. | `{name}` |
| `orders.photoTooBig` | « {name} » dépasse 5 Mo. | “{name}” is larger than 5 MB. | «{name}» supera 5 MB. | `{name}` |
| `orders.photoTooMany` | {n} photos au plus. | {n} photos at most. | {n} foto al massimo. | `{n}` |
| `orders.reportCancel` | Annuler | Cancel | Annulla |  |
| `orders.sending` | Envoi… | Sending… | Invio… |  |
| `orders.reportSent` | Signalement envoyé | Report sent | Segnalazione inviata |  |
| `orders.reportRefused` | Le signalement n’est pas parti. Réessayez dans un instant. | The report was not sent. Please try again in a moment. | La segnalazione non è partita. Riprovate tra un istante. |  |
| `orders.reasonsLoading` | Chargement des raisons… | Loading reasons… | Caricamento dei motivi… |  |
| `orders.reasonsFailed` | Les raisons n’ont pas pu être lues. | The reasons could not be loaded. | Non è stato possibile leggere i motivi. |  |
| `orders.reasonsRetry` | Réessayer | Try again | Riprova |  |
| `orders.noReasonTitle` | Aucune raison proposée | No reason available | Nessun motivo proposto |  |
| `orders.noReasonSubtitle` | Appelez-nous ou écrivez-nous depuis l’accueil. | Call us or write to us from the home page. | Chiamateci o scriveteci dalla pagina iniziale. |  |
| `orders.photoHead` | Des photos, si vous en avez | Photos, if you have any | Delle foto, se le avete |  |
| `orders.photoHint` | Prendre ou choisir une photo | Take or choose a photo | Scattare o scegliere una foto |  |
| `orders.wordHead` | Un mot, si besoin | A word, if needed | Due parole, se serve |  |
| `orders.wordPlaceholder` | Il manquait deux croissants dans le sachet… | Two croissants were missing from the bag… | Mancavano due croissant nel sacchetto… |  |
| `orders.send` | Envoyer au Labo | Send to Le Labo | Inviare al Labo |  |
| `orders.reportFoot` | Camille et Malik reçoivent le message avec la commande, le mode et la photo — rien à réexpliquer. | Camille and Malik get the message with the order, the mode and the photo — nothing to explain twice. | Camille e Malik ricevono il messaggio con l’ordine, la modalità e la foto — niente da rispiegare. |  |

<a id="espace-ordercancel"></a>

### Annuler une commande — Mes commandes et la page invité — `orderCancel`

Source : `screens/order-cancel.copy.ts` · 54 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `orderCancel.action` | Annuler la commande | Cancel the order | Annulla l’ordine |  |
| `orderCancel.title` | Annuler ma commande | Cancel my order | Annulla il mio ordine |  |
| `orderCancel.subtitle` | Commande {reference} | Order {reference} | Ordine {reference} | `{reference}` |
| `orderCancel.moneyNothing` | Rien n’a été prélevé : rien ne le sera. | Nothing has been charged, and nothing will be. | Non è stato addebitato nulla, e nulla lo sarà. |  |
| `orderCancel.moneyRefund` | Vous serez remboursé de {amount} sur votre carte. | You will be refunded {amount} on your card. | Riceverete un rimborso di {amount} sulla vostra carta. | `{amount}` |
| `orderCancel.moneyAccount` | Rien ne sera facturé ni prélevé. | Nothing will be invoiced or charged. | Nulla sarà fatturato né addebitato. |  |
| `orderCancel.voucherBack` | Votre bon de fidélité vous sera rendu. | Your loyalty voucher will be returned to you. | Il vostro buono fedeltà vi sarà restituito. |  |
| `orderCancel.until` | Annulation possible jusqu’au {when}. | You can cancel until {when}. | Annullamento possibile fino al {when}. | `{when}` |
| `orderCancel.untilPassed` | L’annulation en ligne était possible jusqu’au {when}. | Online cancellation was possible until {when}. | L’annullamento online era possibile fino al {when}. | `{when}` |
| `orderCancel.when` | {day} à {time} | {day} at {time} | {day} alle {time} | `{day}` `{time}` |
| `orderCancel.reasonLabel` | Pourquoi annulez-vous ? | Why are you cancelling? | Perché annullate? |  |
| `orderCancel.reasonPlaceholder` | Choisir un motif | Choose a reason | Scegliete un motivo |  |
| `orderCancel.reasons.no_longer_needed` | Je n’en ai plus besoin | I no longer need it | Non mi serve più |  |
| `orderCancel.reasons.wrong_date` | Je me suis trompé de date | I picked the wrong date | Ho sbagliato data |  |
| `orderCancel.reasons.wrong_products` | Je me suis trompé de produits | I picked the wrong products | Ho sbagliato prodotti |  |
| `orderCancel.reasons.other` | Autre | Other | Altro |  |
| `orderCancel.reasonText` | Précisez | Tell us more | Precisate |  |
| `orderCancel.reasonTextPlaceholder` | En quelques mots | In a few words | In poche parole |  |
| `orderCancel.confirm` | Annuler ma commande | Cancel my order | Annulla il mio ordine |  |
| `orderCancel.confirming` | Annulation… | Cancelling… | Annullamento… |  |
| `orderCancel.keep` | Garder ma commande | Keep my order | Tengo l’ordine |  |
| `orderCancel.done` | Commande annulée | Order cancelled | Ordine annullato |  |
| `orderCancel.doneSubtitle` | Un e-mail de confirmation vous a été envoyé. | A confirmation e-mail has been sent to you. | Vi abbiamo inviato un’e-mail di conferma. |  |
| `orderCancel.contact` | Contacter la boutique | Contact the shop | Contattare il negozio |  |
| `orderCancel.refusals.already_cancelled` | Cette commande est déjà annulée. | This order is already cancelled. | Questo ordine è già annullato. |  |
| `orderCancel.refusals.in_preparation` | Votre commande est déjà en préparation : elle ne peut plus être annulée. Contactez-nous si besoin. | Your order is already being prepared: it can no longer be cancelled. Contact us if needed. | Il vostro ordine è già in preparazione: non può più essere annullato. Contattateci se necessario. |  |
| `orderCancel.refusals.ready` | Votre commande est prête : elle ne peut plus être annulée. | Your order is ready: it can no longer be cancelled. | Il vostro ordine è pronto: non può più essere annullato. |  |
| `orderCancel.refusals.fulfilled` | Votre commande a déjà été retirée : elle ne peut plus être annulée. | Your order has already been collected: it can no longer be cancelled. | Il vostro ordine è già stato ritirato: non può più essere annullato. |  |
| `orderCancel.refusals.too_late` | Il est trop tard pour annuler en ligne : c’était possible jusqu’au {when}. Contactez-nous. | It is too late to cancel online: it was possible until {when}. Contact us. | È troppo tardi per annullare online: era possibile fino al {when}. Contattateci. | `{when}` |
| `orderCancel.refusals.payment_in_progress` | Un paiement est en cours sur cette commande. Réessayez dans quelques minutes. | A payment is in progress on this order. Try again in a few minutes. | Un pagamento è in corso su questo ordine. Riprovate tra qualche minuto. |  |
| `orderCancel.refusals.paid_just_now` | Votre paiement vient d’aboutir. Rechargez la page pour annuler avec remboursement. | Your payment has just gone through. Reload the page to cancel with a refund. | Il vostro pagamento è appena andato a buon fine. Ricaricate la pagina per annullare con rimborso. |  |
| `orderCancel.refusals.not_recorded` | Nous n’avons pas pu annuler votre commande. Rien n’a été prélevé de plus ; réessayez dans un instant. | We could not cancel your order. Nothing more has been charged; try again in a moment. | Non siamo riusciti ad annullare il vostro ordine. Non è stato addebitato altro; riprovate tra un istante. |  |
| `orderCancel.refusals.invoiced` | Cette commande est déjà facturée : elle ne s’annule plus en ligne. Contactez-nous. | This order has already been invoiced: it can no longer be cancelled online. Contact us. | Questo ordine è già fatturato: non si annulla più online. Contattateci. |  |
| `orderCancel.refusals.voucher_reused` | Le bon utilisé sur cette commande a déjà resservi : contactez-nous pour l’annuler. | The voucher used on this order has already been used again: contact us to cancel it. | Il buono usato su questo ordine è già stato riutilizzato: contattateci per annullarlo. |  |
| `orderCancel.refusals.account_required` | Connectez-vous pour gérer cette commande. | Sign in to manage this order. | Accedete per gestire questo ordine. |  |
| `orderCancel.refusals.account_disabled` | Contactez la boutique pour gérer cette commande. | Contact the shop to manage this order. | Contattate il negozio per gestire questo ordine. |  |
| `orderCancel.refusals.not_allowed` | Cette commande ne peut pas être annulée depuis votre compte. | This order cannot be cancelled from your account. | Questo ordine non può essere annullato dal vostro account. |  |
| `orderCancel.tooLateUndated` | Il est trop tard pour annuler en ligne. Contactez-nous. | It is too late to cancel online. Contact us. | È troppo tardi per annullare online. Contattateci. |  |
| `orderCancel.refusedFallback` | La commande n’a pas pu être annulée. Réessayez dans un instant. | The order could not be cancelled. Try again in a moment. | L’ordine non ha potuto essere annullato. Riprovate tra un istante. |  |
| `orderCancel.loading` | Chargement de la commande… | Loading the order… | Caricamento dell’ordine… |  |
| `orderCancel.loadFailed` | La commande n’a pas pu être lue. | The order could not be loaded. | Non è stato possibile leggere l’ordine. |  |
| `orderCancel.retry` | Réessayer | Try again | Riprova |  |
| `orderCancel.guestTitle` | Votre commande | Your order | Il vostro ordine |  |
| `orderCancel.guestGreeting` | Bonjour {name}, | Hello {name}, | Buongiorno {name}, | `{name}` |
| `orderCancel.guestLead` | Voici votre commande. Vous pouvez l’annuler ici si elle ne vous sert plus. | Here is your order. You can cancel it here if you no longer need it. | Ecco il vostro ordine. Potete annullarlo qui se non vi serve più. |  |
| `orderCancel.guestLinesHead` | Articles | Items | Articoli |  |
| `orderCancel.guestTotal` | Total | Total | Totale |  |
| `orderCancel.guestDay` | Jour | Day | Giorno |  |
| `orderCancel.guestPickup` | Retrait · {place} | Pickup · {place} | Ritiro · {place} | `{place}` |
| `orderCancel.guestDelivery` | Livraison · {city} | Delivery · {city} | Consegna · {city} | `{city}` |
| `orderCancel.guestPickupNoPlace` | Retrait | Pickup | Ritiro |  |
| `orderCancel.guestDeliveryNoCity` | Livraison | Delivery | Consegna |  |
| `orderCancel.linkNotFoundTitle` | Ce lien est introuvable ou trop ancien | This link cannot be found or is too old | Questo link è introvabile o troppo vecchio |  |
| `orderCancel.linkNotFoundSubtitle` | Contactez la boutique pour toute question sur votre commande. | Contact the shop for any question about your order. | Contattate il negozio per qualsiasi domanda sul vostro ordine. |  |

<a id="espace-loyalty"></a>

### Fidélité — `loyalty`

Source : `screens/loyalty.copy.ts` · 38 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `loyalty.title` | Ma fidélité | My loyalty | La mia fedeltà |  |
| `loyalty.lead` | Vos points, vos bons, et ce qu’ils vous ont rapporté. | Your points, your vouchers, and what they earned you. | I tuoi punti, i tuoi buoni e quello che ti hanno fruttato. |  |
| `loyalty.closedTitle` | Le programme de fidélité n’est pas ouvert. | The loyalty programme is not open. | Il programma fedeltà non è aperto. |  |
| `loyalty.balanceLabel` | Votre solde | Your balance | Il tuo saldo |  |
| `loyalty.points` | {n} points | {n} points | {n} punti | `{n}` |
| `loyalty.stepWorth` | {points} points = un bon de {value} HT | {points} points = a {value} voucher (excl. VAT) | {points} punti = un buono da {value} IVA esclusa | `{points}` `{value}` |
| `loyalty.convertibleNone` | Pas encore assez de points pour un bon. | Not enough points for a voucher yet. | Non hai ancora abbastanza punti per un buono. |  |
| `loyalty.convertibleOne` | Vous pouvez convertir 1 palier. | You can convert 1 step. | Puoi convertire 1 soglia. |  |
| `loyalty.convertibleMany` | Vous pouvez convertir jusqu’à {n} paliers. | You can convert up to {n} steps. | Puoi convertire fino a {n} soglie. | `{n}` |
| `loyalty.stepsLabel` | Nombre de paliers | Number of steps | Numero di soglie |  |
| `loyalty.stepOption` | {n} palier(s) — un bon de {value} HT | {n} step(s) — a {value} voucher (excl. VAT) | {n} soglia/e — un buono da {value} IVA esclusa | `{n}` `{value}` |
| `loyalty.convert` | Convertir en bon | Convert to a voucher | Converti in buono |  |
| `loyalty.confirmMessage` | Convertir {points} points en un bon de {value} HT ? | Convert {points} points into a {value} voucher (excl. VAT)? | Convertire {points} punti in un buono da {value} IVA esclusa? | `{points}` `{value}` |
| `loyalty.confirm` | Convertir | Convert | Converti |  |
| `loyalty.cancel` | Annuler | Cancel | Annulla |  |
| `loyalty.busy` | Conversion… | Converting… | Conversione… |  |
| `loyalty.converted` | Votre bon de {value} HT est prêt. | Your {value} voucher (excl. VAT) is ready. | Il tuo buono da {value} IVA esclusa è pronto. | `{value}` |
| `loyalty.balanceChanged` | Votre solde a changé entre-temps : nous l’avons rechargé. Vérifiez le nombre de paliers, puis recommencez. | Your balance changed in the meantime: we reloaded it. Check the number of steps, then try again. | Il tuo saldo è cambiato nel frattempo: lo abbiamo ricaricato. Controlla il numero di soglie e riprova. |  |
| `loyalty.convertFailed` | La conversion n’a pas abouti. Réessayez dans un instant. | The conversion did not go through. Please try again shortly. | La conversione non è riuscita. Riprova tra un istante. |  |
| `loyalty.vatNote` | Un bon réduit le prix hors taxe de vos achats ; la baisse sur votre total est un peu plus grande, TVA comprise. | A voucher lowers the price of your purchases before VAT; the drop in your total is slightly larger, VAT included. | Un buono riduce il prezzo dei tuoi acquisti al netto dell’IVA; il calo sul totale è un po’ più grande, IVA inclusa. |  |
| `loyalty.vouchersTitle` | Mes bons | My vouchers | I miei buoni |  |
| `loyalty.voucherValue` | {value} HT | {value} excl. VAT | {value} IVA esclusa | `{value}` |
| `loyalty.voucherUntil` | valable jusqu’au {date} | valid until {date} | valido fino al {date} | `{date}` |
| `loyalty.voucherUsedOn` | utilisé sur {order} | used on {order} | usato su {order} | `{order}` |
| `loyalty.voucherExpired` | expiré | expired | scaduto |  |
| `loyalty.voucherCancelled` | annulé | cancelled | annullato |  |
| `loyalty.historyTitle` | Historique | History | Storico |  |
| `loyalty.entryEarned` | Commande {order} | Order {order} | Ordine {order} | `{order}` |
| `loyalty.entryEarnedNoOrder` | Commande | Order | Ordine |  |
| `loyalty.entryConverted` | Conversion en bon | Converted to a voucher | Conversione in buono |  |
| `loyalty.entryAdjusted` | Ajustement | Adjustment | Rettifica |  |
| `loyalty.entryWelcome` | Bienvenue | Welcome | Benvenuto |  |
| `loyalty.emptyTitle` | Pas encore de points | No points yet | Ancora nessun punto |  |
| `loyalty.emptyBody` | Vos commandes vous en rapportent une fois retirées et réglées. | Your orders earn points once collected and paid. | I tuoi ordini ne fanno guadagnare una volta ritirati e pagati. |  |
| `loyalty.loading` | Lecture de votre fidélité… | Reading your loyalty… | Lettura della tua fedeltà… |  |
| `loyalty.loadFailedTitle` | Votre fidélité n’a pas pu être lue | Your loyalty could not be read | Impossibile leggere la tua fedeltà |  |
| `loyalty.loadFailedBody` | Vos points sont en sécurité. Réessayez dans un instant. | Your points are safe. Please try again shortly. | I tuoi punti sono al sicuro. Riprova tra un istante. |  |
| `loyalty.retry` | Réessayer | Try again | Riprova |  |

<a id="espace-account"></a>

### Mon compte (factures comprises) — `account`

Source : `screens/account.{fr,en,it}.ts · screens/account-invoices.copy.ts` · 525 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `account.title` | Mon compte | My account | Il mio account |  |
| `account.lead` | Votre dossier tel que nous le tenons : identité, accès, papiers, adresses, conditions de paiement. | Your file as we keep it: identity, access, paperwork, addresses, payment terms. | Il vostro fascicolo così come lo teniamo: identità, accessi, documenti, indirizzi, condizioni di pagamento. |  |
| `account.states.incomplete` | Dossier à compléter | File to complete | Fascicolo da completare |  |
| `account.states.pending` | Dossier en cours | File in progress | Fascicolo in corso |  |
| `account.states.active` | Compte actif | Account active | Account attivo |  |
| `account.states.suspended` | Compte suspendu | Account suspended | Account sospeso |  |
| `account.states.terminated` | Compte clos | Account closed | Account chiuso |  |
| `account.loadFailedTitle` | Votre compte n’a pas pu être lu | Your account could not be loaded | Non è stato possibile leggere il suo account |  |
| `account.loadFailedBody` | Le service ne répond pas pour le moment. Réessayez dans un instant. | The service is not responding right now. Please try again in a moment. | Il servizio non risponde al momento. Riprovi tra un istante. |  |
| `account.loadRetry` | Réessayer | Try again | Riprova |  |
| `account.loading` | Lecture de votre compte… | Loading your account… | Lettura del suo account… |  |
| `account.signedOutTitle` | Connectez-vous pour voir votre compte | Sign in to see your account | Acceda per vedere il suo account |  |
| `account.signedOutBody` | Votre dossier, vos accès et vos papiers vous attendent ici. | Your file, access and paperwork are waiting for you here. | Il suo fascicolo, gli accessi e i documenti la aspettano qui. |  |
| `account.signIn` | Se connecter | Sign in | Accedi |  |
| `account.cardKicker` | Compte professionnel | Trade account | Account professionale |  |
| `account.cardReference` | Ma référence client : {ref} | My customer reference: {ref} | Il mio codice cliente: {ref} | `{ref}` |
| `account.panelDot` | Aller à la section {n} | Go to section {n} | Vai alla sezione {n} | `{n}` |
| `account.cardPaymentHead` | Modes de paiement | Payment methods | Modalità di pagamento |  |
| `account.cardPaymentOnOrder` | À la commande | On order | All’ordine |  |
| `account.cardPaymentOnAccount` | Au compte / périodique | On account / periodic | Su conto / periodico |  |
| `account.cardPaymentPending` | En attente de vos informations | Waiting for your details | In attesa dei tuoi dati |  |
| `account.cardUnknown` | Compte non reconnu | Account not recognised | Account non riconosciuto |  |
| `account.cardUnknownNote` | Connectez-vous pour retrouver votre entreprise. | Sign in to find your company. | Acceda per ritrovare la sua azienda. |  |
| `account.identityUnknown` | — | — | — |  |
| `account.summaryHead` | Le dossier | The file | Il fascicolo |  |
| `account.edit` | Modifier | Edit | Modificare |  |
| `account.details` | Voir le détail | See details | Vedere il dettaglio |  |
| `account.save` | Enregistrer | Save | Registra |  |
| `account.cancel` | Annuler | Cancel | Annulla |  |
| `account.sections.identity` | Identité légale | Legal identity | Identità legale |  |
| `account.sections.users` | Utilisateurs | Users | Utenti |  |
| `account.sections.kbis` | KBIS | Registry extract | Visura |  |
| `account.sections.addresses` | Adresses | Addresses | Indirizzi |  |
| `account.sections.bank` | RIB | Bank details | Coordinate bancarie |  |
| `account.sections.mandate` | Mandat SEPA | SEPA mandate | Mandato SEPA |  |
| `account.sections.payment` | Paiement | Payment | Pagamento |  |
| `account.sections.preferences` | Préférences | Preferences | Preferenze |  |
| `account.sections.data` | Mes données | My data | I miei dati |  |
| `account.identityBrand` | Enseigne | Trading name | Insegna |  |
| `account.identityCompany` | Raison sociale | Registered name | Ragione sociale |  |
| `account.identityForm` | Forme juridique | Legal form | Forma giuridica |  |
| `account.identitySiret` | SIRET | SIRET | SIRET |  |
| `account.identitySiren` | SIREN | SIREN | SIREN |  |
| `account.identityVat` | TVA intracom. | VAT number | Partita IVA intracom. |  |
| `account.identityNote` | L’enseigne se change ici. Les mentions du greffe passent par nous : on vérifie, puis on met à jour — c’est ce qui figure sur vos factures. | The trading name changes here. Registry details go through us: we check, then we update — these are the mentions that appear on your invoices. | L’insegna si cambia qui. Le menzioni del registro passano da noi: verifichiamo, poi aggiorniamo — sono quelle che figurano sulle vostre fatture. |  |
| `account.identityPanelSubtitle` | L’enseigne et la TVA se changent ici ; les mentions du greffe se complètent une fois. | Trading name and VAT change here; registry details are filled in once. | Insegna e partita IVA si cambiano qui; le menzioni del registro si completano una volta. |  |
| `account.identityVatField` | TVA intracommunautaire | Intra-EU VAT number | Partita IVA intracomunitaria |  |
| `account.identityLegalHint` | À compléter une seule fois : une fois enregistrée, cette mention ne se corrige plus qu’avec notre service commercial. | Fill in once: after saving, this detail can only be corrected through our sales team. | Da completare una sola volta: una volta registrata, questa menzione si corregge solo tramite il nostro servizio commerciale. |  |
| `account.identityFormPlaceholder` | À choisir | Choose | Da scegliere |  |
| `account.identityVatRequiredHint` | Obligatoire pour cette forme juridique. | Required for this legal form. | Obbligatoria per questa forma giuridica. |  |
| `account.identityVatOptionalHint` | Facultatif pour cette forme juridique — franchise en base de TVA. | Optional for this legal form — VAT franchise. | Facoltativa per questa forma giuridica — franchigia IVA. |  |
| `account.identityVatUndecidedHint` | Obligatoire ou non selon la forme juridique. | Required or not depending on the legal form. | Obbligatoria o no a seconda della forma giuridica. |  |
| `account.identityOptional` | facultatif | optional | facoltativo |  |
| `account.identityLegalLocked` | Ces mentions viennent du greffe. Pour les corriger, passez par notre service commercial. | These details come from the company registry. To correct them, contact our sales team. | Queste menzioni provengono dal registro delle imprese. Per correggerle, passate dal nostro servizio commerciale. |  |
| `account.identitySaveFailed` | L’identité n’a pas été enregistrée. | Your identity was not saved. | L’identità non è stata registrata. |  |
| `account.railPosition` | Section {n} sur {total} | Section {n} of {total} | Sezione {n} di {total} | `{n}` `{total}` |
| `account.usersHolder` | Détenteur du compte · vous | Account holder · you | Titolare dell’account · voi |  |
| `account.usersAllRights` | Tous droits | All rights | Tutti i diritti |  |
| `account.usersNote` | Un contact peut exister sans espace : un nom et un e-mail suffisent pour recevoir les factures. L’invitation, elle, se décide au cas par cas. | A contact can exist without a workspace: a name and an e-mail are enough to receive the invoices. The invitation is decided case by case. | Un contatto può esistere senza spazio: un nome e un’e-mail bastano per ricevere le fatture. L’invito, invece, si decide caso per caso. |  |
| `account.usersAdd` | Ajouter un utilisateur ou un contact | Add a user or a contact | Aggiungere un utente o un contatto |  |
| `account.usersAddShort` | Ajouter un utilisateur | Add a user | Aggiungere un utente |  |
| `account.usersAddSubtitle` | Ses coordonnées, et ce qu’il fait pour la société. | Their details, and what they do for the company. | I suoi recapiti, e che cosa fa per l’azienda. |  |
| `account.usersAddFailed` | Le contact n’a pas été ajouté. | The contact was not added. | Il contatto non è stato aggiunto. |  |
| `account.tagContact` | Contact seulement | Contact only | Solo contatto |  |
| `account.contactFields.email` | E-mail | Email | E-mail |  |
| `account.contactFields.emailHint` | c’est par là qu’un accès lui serait envoyé | this is where an access would be sent | è a questo indirizzo che verrebbe inviato un accesso |  |
| `account.contactFields.role` | Rôle dans la société | Role in the company | Ruolo nella società |  |
| `account.contactFields.rolePlaceholder` | À choisir | Choose | Da scegliere |  |
| `account.contactFields.roles.admin` | Administrateur | Administrator | Amministratore |  |
| `account.contactFields.roles.orders` | Commandes | Orders | Ordini |  |
| `account.contactFields.roles.billing` | Facturation | Billing | Fatturazione |  |
| `account.contactFields.firstName` | Prénom | First name | Nome |  |
| `account.contactFields.lastName` | Nom | Last name | Cognome |  |
| `account.contactFields.fonction` | Fonction | Job title | Funzione |  |
| `account.contactFields.fonctionPlaceholder` | ex. Responsable achats | e.g. Purchasing manager | es. Responsabile acquisti |  |
| `account.contactFields.phone` | Téléphone | Phone | Telefono |  |
| `account.contactEditHolderTitle` | Modifier le détenteur | Edit the holder | Modificare il titolare |  |
| `account.contactEditTitle` | Modifier le contact | Edit the contact | Modificare il contatto |  |
| `account.contactEditHolderSubtitle` | Les coordonnées du détenteur sur la fiche de la société. Elles ne changent pas son adresse de connexion : celle-ci se change dans « Mes informations ». | The holder’s details on the company record. They do not change their sign-in address: that one is changed under “My details”. | I recapiti del titolare sulla scheda della società. Non cambiano il suo indirizzo di accesso: quello si cambia in «I miei dati personali». |  |
| `account.contactEditSubtitle` | Ses coordonnées, et ce qu’il fait pour la société. | Their details, and what they do for the company. | I suoi recapiti, e che cosa fa per la società. |  |
| `account.contactEditFailed` | Le contact n’a pas été enregistré. | The contact was not saved. | Il contatto non è stato registrato. |  |
| `account.contactRemove` | Supprimer | Delete | Eliminare |  |
| `account.contactRemoveMessage` | Ce contact sera retiré de la société. | This contact will be removed from the company. | Questo contatto sarà tolto dalla società. |  |
| `account.contactRemoveConfirm` | Oui, supprimer | Yes, delete | Sì, eliminare |  |
| `account.contactRemoveBusy` | Suppression… | Deleting… | Eliminazione… |  |
| `account.contactRemoveGroup` | Confirmer la suppression du contact | Confirm deleting the contact | Confermare l’eliminazione del contatto |  |
| `account.contactRemoveFailed` | Le contact n’a pas été supprimé. | The contact was not deleted. | Il contatto non è stato eliminato. |  |
| `account.dangerZone` | Zone de danger | Danger zone | Zona pericolosa |  |
| `account.profilePageLead` | Qui vous êtes, et comment vous entrez dans votre compte. | Who you are, and how you sign in to your account. | Chi siete e come accedete al vostro account. |  |
| `account.profileIdentityTitle` | Identité | Identity | Identità |  |
| `account.profileFirstName` | Prénom | First name | Nome |  |
| `account.profileLastName` | Nom | Last name | Cognome |  |
| `account.profileEmail` | E-mail | E-mail | E-mail |  |
| `account.profileIdentitySubtitle` | Vos coordonnées personnelles, visibles de nous seuls. | Your personal details, seen only by us. | I vostri recapiti personali, visibili solo a noi. |  |
| `account.profileEmailChange` | Dès l’enregistrement, cette adresse devient votre identifiant de connexion. Un e-mail de vérification y part : ouvrez-le pour la confirmer. | Once saved, this address becomes your sign-in identifier. A verification e-mail is sent to it: open it to confirm. | Dopo la registrazione, questo indirizzo diventa il vostro identificativo di accesso. Vi parte un’e-mail di verifica: apritela per confermarlo. |  |
| `account.profileSaveFailed` | Vos informations n’ont pas été enregistrées. | Your details were not saved. | I vostri dati non sono stati registrati. |  |
| `account.loginMethodsTitle` | Méthodes de connexion | Sign-in methods | Metodi di accesso |  |
| `account.loginMethodsSubtitle` | Ce avec quoi vous entrez dans votre compte. | What you use to get into your account. | Ciò con cui entrate nel vostro account. |  |
| `account.loginMethodsLoading` | Lecture de vos méthodes de connexion… | Reading your sign-in methods… | Lettura dei vostri metodi di accesso… |  |
| `account.loginMethodsFailed` | Impossible de lire vos méthodes de connexion. | Your sign-in methods could not be read. | Impossibile leggere i vostri metodi di accesso. |  |
| `account.loginMethodsRetry` | Réessayer | Try again | Riprovare |  |
| `account.loginMethodsEmpty` | Aucune méthode de connexion | No sign-in method | Nessun metodo di accesso |  |
| `account.loginMethodsEmptyHint` | Ajoutez-en une pour entrer plus vite la prochaine fois. | Add one to get in faster next time. | Aggiungetene uno per entrare più in fretta la prossima volta. |  |
| `account.loginMethodPrimary` | Méthode principale | Primary method | Metodo principale |  |
| `account.loginMethodsAdd` | En ajouter une | Add one | Aggiungerne uno |  |
| `account.loginMethodAdd` | Ajouter {provider} | Add {provider} | Aggiungere {provider} | `{provider}` |
| `account.loginMethodsPromise` | Vous vous connecterez au même compte, avec les mêmes commandes. | You will sign in to the same account, with the same orders. | Accederete allo stesso account, con gli stessi ordini. |  |
| `account.loginMethodRemove` | Retirer | Remove | Rimuovere |  |
| `account.loginMethodRemoveMessage` | Vous ne pourrez plus entrer avec. Rien n’est supprimé chez le fournisseur : ce compte y redevient autonome. | You will no longer get in with it. Nothing is deleted at the provider: that account becomes standalone again there. | Non potrete più entrare con questo metodo. Nulla viene eliminato presso il fornitore: quell’account vi torna autonomo. |  |
| `account.loginMethodRemoveConfirm` | Oui, retirer | Yes, remove | Sì, rimuovere |  |
| `account.loginMethodRemoveBusy` | Retrait… | Removing… | Rimozione… |  |
| `account.loginMethodRemoveGroup` | Confirmer le retrait de cette méthode de connexion | Confirm removing this sign-in method | Confermare la rimozione di questo metodo di accesso |  |
| `account.loginMethodAuthFailed` | L’autorisation n’a pas abouti. Réessayez. | Authorisation did not complete. Try again. | L’autorizzazione non è andata a buon fine. Riprovate. |  |
| `account.loginMethodRetry` | Recommencer | Start over | Ricominciare |  |
| `account.loginMethodEmail` | E-mail | E-mail | E-mail |  |
| `account.loginMethodEmailCode` | Code par e-mail | Code by e-mail | Codice via e-mail |  |
| `account.loginMethodGoogle` | Google | Google | Google |  |
| `account.loginMethodFacebook` | Facebook | Facebook | Facebook |  |
| `account.loginMethodEmailChange` | Changer mon adresse | Change my address | Cambiare il mio indirizzo |  |
| `account.loginMethodEmailChangeTitle` | Changer mon adresse de connexion | Change my sign-in address | Cambiare il mio indirizzo di accesso |  |
| `account.loginMethodEmailCurrent` | Adresse actuelle | Current address | Indirizzo attuale |  |
| `account.loginMethodEmailNew` | Nouvelle adresse e-mail | New email address | Nuovo indirizzo e-mail |  |
| `account.loginMethodEmailConfirm` | Confirmer la nouvelle adresse | Confirm the new address | Conferma il nuovo indirizzo |  |
| `account.loginMethodEmailMismatch` | Les deux adresses ne sont pas identiques. | The two addresses do not match. | I due indirizzi non coincidono. |  |
| `account.loginMethodEmailSame` | C’est déjà votre adresse de connexion. | This is already your sign-in address. | È già il tuo indirizzo di accesso. |  |
| `account.loginMethodPasswordChange` | Changer mon mot de passe | Change my password | Cambiare la mia password |  |
| `account.loginMethodPasswordSent` | Un lien vous a été envoyé. | A link has been sent to you. | Vi è stato inviato un link. |  |
| `account.loginMethodPasswordFailed` | Le lien n’a pas pu être envoyé. | The link could not be sent. | Il link non è stato inviato. |  |
| `account.proAccountTitle` | Ouvrir un compte professionnel | Open a business account | Aprire un account professionale |  |
| `account.proAccountLead` | Commandez au nom de votre établissement, aux tarifs professionnels, avec une facture à son nom. | Order on behalf of your business, at professional rates, with an invoice in its name. | Ordinate a nome della vostra attività, a tariffe professionali, con fattura intestata a lei. |  |
| `account.proAccountLink` | Ouvrir un compte pro | Open a business account | Aprire un account pro |  |
| `account.proAccountsTitle` | Mes comptes professionnels | My business accounts | I miei account professionali |  |
| `account.proAccountsLead` | Les entreprises auxquelles vous êtes rattaché. Basculez dans l’une d’elles depuis le menu du compte. | The companies you belong to. Switch to one of them from the account menu. | Le aziende a cui sei collegato. Passa a una di esse dal menu dell’account. |  |
| `account.proAccountAnother` | Ouvrir un autre compte pro | Open another business account | Aprire un altro account pro |  |
| `account.kbisHead` | L’extrait du greffe | The registry extract | La visura camerale |  |
| `account.kbisCertified` | Certifié | Certified | Certificato |  |
| `account.kbisPending` | En attente de vérification | Awaiting verification | In attesa di verifica |  |
| `account.kbisNone` | Aucun extrait déposé | No extract on file | Nessun estratto depositato |  |
| `account.kbisUpload` | Déposer le KBIS | Upload the KBIS | Depositare il KBIS |  |
| `account.kbisFiled` | Déposé le {date} | Filed on {date} | Depositato il {date} | `{date}` |
| `account.kbisOpen` | Ouvrir | Open | Aprire |  |
| `account.kbisReplace` | Remplacer | Replace | Sostituire |  |
| `account.kbisView` | Voir le KBIS | View the KBIS | Vedere il KBIS |  |
| `account.kbisDownload` | Télécharger | Download | Scaricare |  |
| `account.kbisDrop` | Déposer | Upload | Depositare |  |
| `account.kbisHint` | PDF, 10 Mo maximum | PDF, 10 MB maximum | PDF, 10 MB al massimo |  |
| `account.kbisUploading` | Envoi du KBIS… | Uploading the KBIS… | Invio del KBIS… |  |
| `account.kbisSaveFailed` | Le KBIS n’a pas été déposé. | The KBIS was not uploaded. | Il KBIS non è stato depositato. |  |
| `account.kbisFetchFailed` | Le KBIS n’a pas pu être récupéré. Réessayez. | The KBIS could not be retrieved. Please try again. | Non è stato possibile recuperare il KBIS. Riprovate. |  |
| `account.billingHead` | Facturation | Billing | Fatturazione |  |
| `account.billingNote` | Une seule adresse de facturation : c’est elle qui figure sur les factures et sur le mandat. | One billing address only: it is the one on your invoices and on the direct-debit mandate. | Un solo indirizzo di fatturazione: è quello che figura sulle fatture e sul mandato. |  |
| `account.deliveryHead` | Livraison | Delivery | Consegna |  |
| `account.deliveryCount` | {n} adresses | {n} addresses | {n} indirizzi | `{n}` |
| `account.deliveryCountOne` | {n} adresse | {n} address | {n} indirizzo | `{n}` |
| `account.addressNoZone` | hors zone | outside our zones | fuori zona |  |
| `account.addressNone` | Aucune adresse enregistrée. | No address on file. | Nessun indirizzo registrato. |  |
| `account.addressDefault` | Par défaut | Default | Predefinito |  |
| `account.addressAdd` | Ajouter une adresse de livraison | Add a delivery address | Aggiungere un indirizzo di consegna |  |
| `account.billingFill` | Renseigner la facturation | Fill in the billing address | Indicare la fatturazione |  |
| `account.billingEdit` | Modifier la facturation | Edit the billing address | Modificare la fatturazione |  |
| `account.addressEdit` | Modifier l’adresse de livraison | Edit the delivery address | Modificare l’indirizzo di consegna |  |
| `account.addressSaveFailed` | L’adresse n’a pas été enregistrée. | The address was not saved. | L’indirizzo non è stato registrato. |  |
| `account.addressSavedToast` | Adresse enregistrée. | Address saved. | Indirizzo registrato. |  |
| `account.addressRemove` | Supprimer | Remove | Eliminare |  |
| `account.addressRemoveMessage` | Retirer cette adresse du carnet ? Les commandes déjà passées gardent la leur. | Remove this address from the book? Orders already placed keep theirs. | Togliere questo indirizzo dalla rubrica? Gli ordini già passati conservano il loro. |  |
| `account.addressRemoveConfirm` | Supprimer l’adresse | Remove the address | Eliminare l’indirizzo |  |
| `account.addressRemoveBusy` | Suppression… | Removing… | Eliminazione… |  |
| `account.addressRemoveGroup` | Confirmer la suppression de l’adresse | Confirm removing the address | Confermare l’eliminazione dell’indirizzo |  |
| `account.addressRemovedToast` | Adresse supprimée. | Address removed. | Indirizzo eliminato. |  |
| `account.addressActionFailed` | Le carnet n’a pas été modifié. | The address book was not changed. | La rubrica non è stata modificata. |  |
| `account.deliveryDialogSubtitle` | Une adresse postale complète, et comment on y livre. | A full postal address, and how we deliver there. | Un indirizzo postale completo, e come vi consegniamo. |  |
| `account.depositAllowedLabel` | Dépôt autorisé sans personne | Drop-off allowed with nobody present | Deposito autorizzato senza nessuno |  |
| `account.depositAllowedHint` | Vous autorisez le livreur à déposer la commande sans personne pour la réceptionner, avec une photo pour preuve. | You allow the driver to leave the order with nobody there to receive it, with a photo as proof. | Autorizzate il corriere a lasciare l’ordine senza nessuno a riceverlo, con una foto come prova. |  |
| `account.deliveryAddSubmit` | Ajouter | Add | Aggiungi |  |
| `account.addressForm.label` | Nom de l'adresse | Address name | Nome dell'indirizzo |  |
| `account.addressForm.labelHint` | ex. Siège, Boutique Bastille | e.g. Head office, Bastille shop | es. Sede, Negozio Bastille |  |
| `account.addressForm.line1` | Adresse | Address | Indirizzo |  |
| `account.addressForm.line1Placeholder` | n° et voie | number and street | numero e via |  |
| `account.addressForm.line2` | Complément | Address line 2 | Complemento |  |
| `account.addressForm.line2Hint` | bâtiment, étage, digicode… | building, floor, door code… | edificio, piano, citofono… |  |
| `account.addressForm.postalCode` | Code postal | Postcode | CAP |  |
| `account.addressForm.city` | Ville | City | Città |  |
| `account.addressForm.country` | Pays | Country | Paese |  |
| `account.addressForm.countryPlaceholder` | Choisir un pays… | Choose a country… | Scegli un paese… |  |
| `account.addressForm.optional` | optionnel | optional | facoltativo |  |
| `account.addressForm.noteLabel` | Consignes d’accès | Access instructions | Istruzioni di accesso |  |
| `account.addressForm.notePlaceholder` | Digicode, étage, où déposer… | Door code, floor, where to leave it… | Citofono, piano, dove lasciare… |  |
| `account.addressForm.coordinatesLabel` | Point GPS | GPS point | Punto GPS |  |
| `account.addressForm.coordinatesHint` | pour les lieux qu’une adresse ne suffit pas à trouver | for places an address is not enough to find | per i luoghi che un indirizzo non basta a trovare |  |
| `account.addressForm.entryModeAria` | Mode de saisie du point | How to enter the point | Modalità di inserimento del punto |  |
| `account.addressForm.entryModePair` | Deux champs | Two fields | Due campi |  |
| `account.addressForm.entryModePasted` | Point collé | Pasted point | Punto incollato |  |
| `account.addressForm.latitude` | Latitude | Latitude | Latitudine |  |
| `account.addressForm.latitudePlaceholder` | 48.8566 | 48.8566 | 48.8566 |  |
| `account.addressForm.longitude` | Longitude | Longitude | Longitudine |  |
| `account.addressForm.longitudePlaceholder` | 2.3522 | 2.3522 | 2.3522 |  |
| `account.addressForm.point` | Point | Point | Punto |  |
| `account.addressForm.pointHint` | collez « 48.8566, 2.3522 » depuis une carte | paste “48.8566, 2.3522” from a map | incollate «48.8566, 2.3522» da una mappa |  |
| `account.addressForm.pointPlaceholder` | 48.8566, 2.3522 | 48.8566, 2.3522 | 48.8566, 2.3522 |  |
| `account.deliveryForm.defaultLabel` | Adresse de livraison par défaut | Default delivery address | Indirizzo di consegna predefinito |  |
| `account.deliveryForm.defaultHint` | utilisée d’office pour les prochaines commandes | used automatically for your next orders | usato automaticamente per i prossimi ordini |  |
| `account.deliveryForm.legend` | Adresse postale | Postal address | Indirizzo postale |  |
| `account.deliveryForm.address.label` | Nom de l'adresse | Address name | Nome dell'indirizzo |  |
| `account.deliveryForm.address.labelHint` | ex. Chalet, Restaurant d’altitude | e.g. Chalet, Mountain restaurant | es. Chalet, Ristorante in quota |  |
| `account.deliveryForm.address.line1` | Adresse | Address | Indirizzo |  |
| `account.deliveryForm.address.line1Placeholder` | n° et voie | number and street | numero e via |  |
| `account.deliveryForm.address.line2` | Complément | Address line 2 | Complemento |  |
| `account.deliveryForm.address.line2Hint` | bâtiment, étage, instructions de livraison… | building, floor, delivery instructions… | edificio, piano, istruzioni di consegna… |  |
| `account.deliveryForm.address.postalCode` | Code postal | Postcode | CAP |  |
| `account.deliveryForm.address.city` | Ville | City | Città |  |
| `account.deliveryForm.address.country` | Pays | Country | Paese |  |
| `account.deliveryForm.address.countryPlaceholder` | Choisir un pays… | Choose a country… | Scegli un paese… |  |
| `account.deliveryForm.address.optional` | optionnel | optional | facoltativo |  |
| `account.deliveryForm.address.noteLabel` | Note pour les livreurs | Note for the drivers | Nota per i corrieri |  |
| `account.deliveryForm.address.notePlaceholder` | Code d’accès, étage, contact sur place, consignes de dépôt… | Access code, floor, on-site contact, drop-off instructions… | Codice di accesso, piano, contatto sul posto, istruzioni di consegna… |  |
| `account.deliveryForm.address.coordinatesLabel` | Point GPS | GPS point | Punto GPS |  |
| `account.deliveryForm.address.coordinatesHint` | lieux difficiles à localiser | for places that are hard to find | per i luoghi difficili da trovare |  |
| `account.deliveryForm.address.entryModeAria` | Mode de saisie du point | How to enter the point | Modalità di inserimento del punto |  |
| `account.deliveryForm.address.entryModePair` | Deux champs | Two fields | Due campi |  |
| `account.deliveryForm.address.entryModePasted` | Point collé | Pasted point | Punto incollato |  |
| `account.deliveryForm.address.latitude` | Latitude | Latitude | Latitudine |  |
| `account.deliveryForm.address.latitudePlaceholder` | 48.8566 | 48.8566 | 48.8566 |  |
| `account.deliveryForm.address.longitude` | Longitude | Longitude | Longitudine |  |
| `account.deliveryForm.address.longitudePlaceholder` | 2.3522 | 2.3522 | 2.3522 |  |
| `account.deliveryForm.address.point` | Point | Point | Punto |  |
| `account.deliveryForm.address.pointHint` | collez « 48.8566, 2.3522 » depuis une carte | paste “48.8566, 2.3522” from a map | incollate «48.8566, 2.3522» da una mappa |  |
| `account.deliveryForm.address.pointPlaceholder` | 48.8566, 2.3522 | 48.8566, 2.3522 | 48.8566, 2.3522 |  |
| `account.deliveryForm.specs.detailLegend` | Détail de livraison | Delivery details | Dettagli di consegna |  |
| `account.deliveryForm.specs.slotsLegend` | Créneaux préférés | Preferred time slots | Fasce orarie preferite |  |
| `account.deliveryForm.specs.sameEveryDay` | Les mêmes créneaux tous les jours | Same time slots every day | Le stesse fasce orarie ogni giorno |  |
| `account.deliveryForm.specs.sameEveryDayHint` | décochez pour définir des créneaux par jour | untick to set time slots per day | deselezionate per impostare le fasce per giorno |  |
| `account.deliveryForm.specs.everyDay` | Tous les jours | Every day | Tutti i giorni |  |
| `account.deliveryForm.specs.weekdays.mon` | Lundi | Monday | Lunedì |  |
| `account.deliveryForm.specs.weekdays.tue` | Mardi | Tuesday | Martedì |  |
| `account.deliveryForm.specs.weekdays.wed` | Mercredi | Wednesday | Mercoledì |  |
| `account.deliveryForm.specs.weekdays.thu` | Jeudi | Thursday | Giovedì |  |
| `account.deliveryForm.specs.weekdays.fri` | Vendredi | Friday | Venerdì |  |
| `account.deliveryForm.specs.weekdays.sat` | Samedi | Saturday | Sabato |  |
| `account.deliveryForm.specs.weekdays.sun` | Dimanche | Sunday | Domenica |  |
| `account.deliveryForm.specs.slotStart` | Début | Start | Inizio |  |
| `account.deliveryForm.specs.slotEnd` | Fin | End | Fine |  |
| `account.deliveryForm.specs.slotAdd` | Ajouter | Add | Aggiungi |  |
| `account.deliveryForm.specs.slotRemove` | Retirer {slot} | Remove {slot} | Rimuovi {slot} | `{slot}` |
| `account.deliveryForm.specs.slotsNone` | Aucun créneau | No time slot | Nessuna fascia |  |
| `account.deliveryForm.specs.slotOverlap` | Ce créneau en chevauche un autre déjà posé. | This slot overlaps one already set. | Questa fascia si sovrappone a una già impostata. |  |
| `account.deliveryForm.specs.contactLegend` | Contact sur place | On-site contact | Contatto sul posto |  |
| `account.deliveryForm.specs.noContact` | Pas de contact de livraison dédié | No dedicated delivery contact | Nessun contatto di consegna dedicato |  |
| `account.deliveryForm.specs.noContactHint` | cochez si le livreur n’a personne à prévenir sur place | tick if the driver has nobody to call on site | selezionate se il corriere non ha nessuno da avvisare sul posto |  |
| `account.deliveryForm.specs.knownContact` | Reprendre un contact connu | Use a known contact | Riprendi un contatto noto |  |
| `account.deliveryForm.specs.knownContactPlaceholder` | Choisir un contact… | Choose a contact… | Scegli un contatto… |  |
| `account.deliveryForm.specs.firstName` | Prénom | First name | Nome |  |
| `account.deliveryForm.specs.lastName` | Nom | Last name | Cognome |  |
| `account.deliveryForm.specs.phone` | Téléphone | Phone | Telefono |  |
| `account.deliveryForm.specs.contactIncomplete` | Renseignez prénom, nom et téléphone, ou cochez « pas de contact ». | Enter first name, last name and phone, or tick “no contact”. | Inserite nome, cognome e telefono, oppure selezionate «nessun contatto». |  |
| `account.deliveryForm.specs.signature` | Signature à la remise | Signature on delivery | Firma alla consegna |  |
| `account.deliveryForm.specs.signatureHint` | préremplit les commandes livrées ici ; modifiable au panier | prefills orders delivered here; can be changed in the cart | precompila gli ordini consegnati qui; modificabile nel carrello |  |
| `account.deliveryForm.specs.signatureInherit` | Comme la société ({floor}) | Same as the company ({floor}) | Come la società ({floor}) | `{floor}` |
| `account.deliveryForm.specs.signatureFloorRequired` | exigée | required | richiesta |  |
| `account.deliveryForm.specs.signatureFloorNotRequired` | non exigée | not required | non richiesta |  |
| `account.deliveryForm.specs.signatureRequired` | Exigée | Required | Richiesta |  |
| `account.deliveryForm.specs.signatureNotRequired` | Non exigée | Not required | Non richiesta |  |
| `account.deliveryForm.specs.signatureNoContactHint` | sans contact sur place, personne ne peut signer à la remise | with nobody on site, nobody can sign on delivery | senza un contatto sul posto, nessuno può firmare alla consegna |  |
| `account.deliveryForm.specs.windowMode` | Créneau ou échéance | Slot or deadline | Fascia o scadenza |  |
| `account.deliveryForm.specs.windowModeHint` | un créneau a un début et une fin ; une échéance, seulement une heure limite | a slot has a start and an end; a deadline, only a latest time | una fascia ha un inizio e una fine; una scadenza, solo un orario limite |  |
| `account.deliveryForm.specs.windowModeInherit` | Comme le réglage général ({mode}) | Same as the general setting ({mode}) | Come l’impostazione generale ({mode}) | `{mode}` |
| `account.deliveryForm.specs.windowModeSlotLower` | créneau | slot | fascia |  |
| `account.deliveryForm.specs.windowModeDeadlineLower` | échéance | deadline | scadenza |  |
| `account.deliveryForm.specs.windowModeSlot` | Créneau | Slot | Fascia |  |
| `account.deliveryForm.specs.windowModeDeadline` | Échéance | Deadline | Scadenza |  |
| `account.deliveryForm.specs.deadlinesLegend` | Échéances préférées | Preferred deadlines | Scadenze preferite |  |
| `account.deliveryForm.specs.sameDeadlinesEveryDay` | Les mêmes échéances tous les jours | Same deadlines every day | Le stesse scadenze ogni giorno |  |
| `account.deliveryForm.specs.sameDeadlinesEveryDayHint` | décochez pour définir des échéances par jour | untick to set deadlines per day | deselezionate per definire scadenze per giorno |  |
| `account.deliveryForm.specs.deadlineBefore` | avant | before | entro le |  |
| `account.deliveryForm.specs.deadlineNew` | Nouvelle échéance | New deadline | Nuova scadenza |  |
| `account.deliveryForm.specs.deadlineAdd` | Ajouter | Add | Aggiungi |  |
| `account.deliveryForm.specs.deadlineRemove` | Retirer {deadline} | Remove {deadline} | Rimuovi {deadline} | `{deadline}` |
| `account.deliveryForm.specs.deadlinesNone` | Aucune échéance | No deadline | Nessuna scadenza |  |
| `account.termMonthly` | Paiement à 30 jours fin de mois | 30 days end of month | Pagamento a 30 giorni fine mese |  |
| `account.termGrantedSub` | Accordé par votre commercial : vos commandes se règlent en fin de mois. | Granted by your sales contact: your orders are settled at month end. | Concesso dal vostro commerciale: gli ordini si saldano a fine mese. |  |
| `account.termRequestedSub` | Demande envoyée : votre commercial la valide. | Request sent: your sales contact will approve it. | Richiesta inviata: il vostro commerciale la convalida. |  |
| `account.termNoneSub` | Sur demande : votre commercial l’accorde société par société. | On request: your sales contact grants it company by company. | Su richiesta: il vostro commerciale lo concede società per società. |  |
| `account.termSuspendedSub` | Prélèvement mensuel suspendu — vos commandes se règlent par carte. | Monthly direct debit suspended — your orders are paid by card. | Addebito mensile sospeso — gli ordini si pagano con carta. |  |
| `account.termOrder` | À la commande | At checkout | All’ordine |  |
| `account.termOrderSub` | Carte ou Apple Pay, sans attendre la facture | Card or Apple Pay, without waiting for the invoice | Carta o Apple Pay, senza aspettare la fattura |  |
| `account.stateActive` | Actif | Active | Attivo |  |
| `account.stateAvailable` | Disponible | Available | Disponibile |  |
| `account.stateRequested` | En attente | Pending | In attesa |  |
| `account.stateSuspended` | Suspendu | Suspended | Sospeso |  |
| `account.paymentNote` | Deux régimes, pas plus : fin de mois quand un crédit est accordé, à la commande sinon — et tout le monde peut commander à la commande. | Two regimes, no more: end of month when credit is granted, at checkout otherwise — and everyone can order at checkout. | Due regimi, non di più: fine mese quando un credito è concesso, all’ordine altrimenti — e tutti possono ordinare all’ordine. |  |
| `account.termRequest` | Demander le règlement mensuel | Request monthly payment | Richiedere il pagamento mensile |  |
| `account.termRequestNote` | C’est une demande : rien ne change tant que votre commercial ne l’a pas validée. | This is a request: nothing changes until your sales contact approves it. | È una richiesta: nulla cambia finché il vostro commerciale non l’ha convalidata. |  |
| `account.termRequestFailed` | La demande n’a pas été enregistrée. | The request was not saved. | La richiesta non è stata registrata. |  |
| `account.prefPickup` | Retrait habituel | Usual pickup | Ritiro abituale |  |
| `account.prefNone` | Rien de posé — la question se pose à chaque commande. | Nothing set — we ask on each order. | Nulla impostato — la domanda torna a ogni ordine. |  |
| `account.prefPickupAt` | Retrait au | Collection at | Ritiro al |  |
| `account.prefPickupAny` | Retrait | Collection | Ritiro |  |
| `account.prefDeliveryTo` | Livraison | Delivery to | Consegna |  |
| `account.prefDeliveryAny` | Livraison | Delivery | Consegna |  |
| `account.stateUnavailable` | Non accordé | Not granted | Non concesso |  |
| `account.prefLang` | Langue | Language | Lingua |  |
| `account.prefNote` | Une opération datée ne prévient qu’une fois par saison. Les livraisons et les factures, elles, sont actives par défaut. | A dated operation warns once a season. Deliveries and invoices are on by default. | Un’operazione a data avvisa una volta per stagione. Consegne e fatture, invece, sono attive di default. |  |
| `account.prefMethod` | Mode habituel | Usual mode | Modalità abituale |  |
| `account.prefMethodNone` | Aucun — choisir à chaque commande | None — choose on each order | Nessuna — scegliere a ogni ordine |  |
| `account.prefMethodPickup` | Retrait | Collection | Ritiro |  |
| `account.prefMethodDelivery` | Livraison | Delivery | Consegna |  |
| `account.prefPickupPoint` | Point de retrait | Collection point | Punto di ritiro |  |
| `account.prefPickupDefault` | Aucun en particulier | None in particular | Nessuno in particolare |  |
| `account.prefDeliveryAddress` | Adresse de livraison | Delivery address | Indirizzo di consegna |  |
| `account.prefDeliveryDefault` | L’adresse par défaut de la société | The company’s default address | L’indirizzo predefinito della società |  |
| `account.prefDefaultTag` | défaut | default | predefinito |  |
| `account.prefSaveFailed` | La préférence n’a pas été enregistrée. | The preference was not saved. | La preferenza non è stata registrata. |  |
| `account.prefLangNote` | La langue change tout de suite, sans rien enregistrer. | The language changes right away, nothing to save. | La lingua cambia subito, senza registrare nulla. |  |
| `account.dataExportOrders` | Exporter mes commandes et mes factures | Export my orders and my invoices | Esportare i miei ordini e le mie fatture |  |
| `account.dataExportOrdersSub` | CSV et PDF, par exercice | CSV and PDF, by financial year | CSV e PDF, per esercizio |  |
| `account.dataExportPersonal` | Télécharger mes données personnelles | Download my personal data | Scaricare i miei dati personali |  |
| `account.dataExportPersonalSub` | Tout ce que nous avons, en un fichier | Everything we hold, in one file | Tutto quello che abbiamo, in un file |  |
| `account.dataSummary` | Conservation, transfert et fermeture de l’espace | Retention, transfer and closing of the workspace | Conservazione, trasferimento e chiusura dello spazio |  |
| `account.dataKeep` | Vos factures restent disponibles dix ans après la fermeture — c’est une obligation, pas un choix. | Your invoices stay available for ten years after closing — that is an obligation, not a choice. | Le vostre fatture restano disponibili dieci anni dopo la chiusura — è un obbligo, non una scelta. |  |
| `account.dangerHead` | Zone sensible | Sensitive area | Zona sensibile |  |
| `account.transferHead` | Transférer l’entreprise | Transfer the company | Trasferire l’azienda |  |
| `account.transferBody` | Vous cédez le rôle de détenteur à un utilisateur de l’espace. Il reprend la facturation, les conditions de paiement et le droit d’inviter. Vous gardez votre accès, sans l’administration. | You hand the holder role to a user of the workspace. They take over billing, payment terms and the right to invite. You keep your access, without administration. | Cedete il ruolo di titolare a un utente dello spazio. Riprende la fatturazione, le condizioni di pagamento e il diritto di invitare. Voi mantenete il vostro accesso, senza l’amministrazione. |  |
| `account.transferCta` | Transférer le compte | Transfer the account | Trasferire l’account |  |
| `account.closeHead` | Fermer cet espace | Close this workspace | Chiudere questo spazio |  |
| `account.closeBody` | Définitif, et propre à cet espace : accès révoqué pour vous et vos utilisateurs, remise et conditions de paiement perdues, paniers récurrents supprimés. Vos autres espaces ne bougent pas. Une commande en cours doit être retirée ou annulée avant. | Final, and specific to this workspace: access revoked for you and your users, discount and payment terms lost, recurring baskets deleted. Your other workspaces do not move. A live order must be collected or cancelled first. | Definitivo, e proprio di questo spazio: accesso revocato per voi e per i vostri utenti, sconto e condizioni di pagamento persi, carrelli ricorrenti eliminati. Gli altri spazi non si muovono. Un ordine in corso va ritirato o annullato prima. |  |
| `account.closeCta` | Fermer cet espace | Close this workspace | Chiudere questo spazio |  |
| `account.panelPhone` | Téléphone | Phone | Telefono |  |
| `account.bankLoading` | Lecture de votre RIB… | Reading your bank details… | Lettura delle coordinate bancarie… |  |
| `account.bankLoadFailedTitle` | Votre RIB n’a pas pu être lu | Your bank details could not be read | Le coordinate bancarie non sono state lette |  |
| `account.bankLoadFailedBody` | Le service ne répond pas pour le moment. Réessayez dans un instant. | The service is not responding right now. Try again in a moment. | Il servizio non risponde al momento. Riprovate tra un istante. |  |
| `account.bankNone` | Aucun RIB enregistré | No bank details on file | Nessuna coordinata bancaria registrata |  |
| `account.bankRegistered` | RIB enregistré | Bank details on file | Coordinate bancarie registrate |  |
| `account.bankLast4` | •••• {last4} | •••• {last4} | •••• {last4} | `{last4}` |
| `account.bankNotice` | Le titulaire et l’adresse sont ceux que connaît votre banque : ils peuvent différer de votre raison sociale. Si un prélèvement SEPA est en place, le RIB ne peut plus être remplacé ici : pour changer de banque, contactez-nous. | The account holder and address are the ones your bank knows: they may differ from your registered company name. If a SEPA direct debit is in place, the bank details can no longer be replaced here: to change banks, contact us. | Il titolare e l’indirizzo sono quelli noti alla vostra banca: possono differire dalla ragione sociale. Se è attivo un addebito diretto SEPA, l’IBAN non può più essere sostituito qui: per cambiare banca, contattateci. |  |
| `account.bankForm.holder` | Titulaire du compte | Account holder | Titolare del conto |  |
| `account.bankForm.holderLegalForm` | Civilité (M., Mme) ou forme juridique (SAS, SARL…) | Title (Mr, Ms) or legal form (SAS, SARL…) | Titolo (Sig., Sig.ra) o forma giuridica (SAS, SARL…) |  |
| `account.bankForm.holderLegalFormHint` | Exigée par le mandat interentreprises. La forme seule — le nom va dans Titulaire. | Required by the business-to-business mandate. The form only — the name goes in Account holder. | Richiesto dal mandato tra imprese. Solo la forma — il nome va in Titolare del conto. |  |
| `account.bankForm.holderLegalFormOther` | Autre forme | Other form | Altra forma |  |
| `account.bankForm.holderLegalFormOtherLabel` | Autre… | Other… | Altro… |  |
| `account.bankForm.holderPreview` | Imprimé sur le mandat | Printed on the mandate | Stampato sul mandato |  |
| `account.bankForm.line1` | Adresse | Address | Indirizzo |  |
| `account.bankForm.line2` | Complément | Address line 2 | Complemento |  |
| `account.bankForm.postalCode` | Code postal | Postcode | CAP |  |
| `account.bankForm.city` | Ville | City | Città |  |
| `account.bankForm.country` | Pays | Country | Paese |  |
| `account.bankForm.iban` | IBAN | IBAN | IBAN |  |
| `account.bankForm.ibanHint` | Saisi une fois. Il ne sera plus jamais réaffiché. | Entered once. It will never be shown again. | Inserito una volta. Non sarà mai più mostrato. |  |
| `account.bankForm.bic` | BIC | BIC | BIC |  |
| `account.bankSave` | Enregistrer le RIB | Save bank details | Registra le coordinate |  |
| `account.bankReplace` | Remplacer le RIB | Replace bank details | Sostituisci le coordinate |  |
| `account.bankSavedToast` | RIB enregistré. | Bank details saved. | Coordinate bancarie registrate. |  |
| `account.bankSaveFailed` | Le RIB n’a pas été enregistré. | Your bank details were not saved. | Le coordinate bancarie non sono state registrate. |  |
| `account.mandateLoading` | Lecture de votre mandat… | Reading your mandate… | Lettura del mandato… |  |
| `account.mandateLoadFailedTitle` | Votre mandat n’a pas pu être lu | Your mandate could not be read | Il mandato non è stato letto |  |
| `account.mandateLoadFailedBody` | Le service ne répond pas pour le moment. Réessayez dans un instant. | The service is not responding right now. Try again in a moment. | Il servizio non risponde al momento. Riprovate tra un istante. |  |
| `account.mandateNone` | Aucun mandat en cours | No mandate in progress | Nessun mandato in corso |  |
| `account.mandateAwaiting` | Renvoyez le mandat daté et signé | Send back the mandate, dated and signed | Rinviate il mandato datato e firmato |  |
| `account.mandateInReview` | Mandat reçu — en vérification | Mandate received — being checked | Mandato ricevuto — in verifica |  |
| `account.mandateActive` | Mandat actif | Mandate active | Mandato attivo |  |
| `account.mandateReference` | RUM · {reference} | UMR · {reference} | Riferimento · {reference} | `{reference}` |
| `account.mandateSignedOn` | Signé le {date} | Signed on {date} | Firmato il {date} | `{date}` |
| `account.mandateProofFile` | Fichier déposé : {fileName} | File on record: {fileName} | File caricato: {fileName} | `{fileName}` |
| `account.mandateGenerate` | Générer mon mandat | Generate my mandate | Genera il mio mandato |  |
| `account.mandateSend` | Renvoyer le mandat signé | Send back the signed mandate | Rinvia il mandato firmato |  |
| `account.mandateView` | Voir le mandat | View the mandate | Vedi il mandato |  |
| `account.mandateDownload` | Télécharger le mandat | Download the mandate | Scarica il mandato |  |
| `account.mandateNoneBody.CORE` | Le mandat de prélèvement SEPA autorise le prélèvement de vos factures sur le compte de votre RIB. Générez-le : vous pourrez ensuite l’imprimer, le dater, le signer et nous le renvoyer ici. | The SEPA direct debit mandate authorises us to debit your invoices from the account in your bank details. Generate it: you can then print it, date it, sign it and send it back here. | Il mandato di addebito diretto SEPA autorizza l’addebito delle vostre fatture sul conto delle vostre coordinate bancarie. Generatelo: potrete poi stamparlo, datarlo, firmarlo e rinviarcelo qui. |  |
| `account.mandateNoneBody.B2B` | Le mandat de prélèvement SEPA interentreprises autorise le prélèvement de vos factures sur le compte de votre RIB. Générez-le : vous pourrez ensuite l’imprimer, le dater, le signer et nous le renvoyer ici. | The SEPA business-to-business direct debit mandate authorises us to debit your invoices from the account in your bank details. Generate it: you can then print it, date it, sign it and send it back here. | Il mandato di addebito diretto SEPA B2B autorizza l’addebito delle vostre fatture sul conto delle vostre coordinate bancarie. Generatelo: potrete poi stamparlo, datarlo, firmarlo e rinviarcelo qui. |  |
| `account.mandateAwaitingBody.CORE` | Imprimez le mandat, datez-le et signez-le, puis déposez ici son scan ou sa photo. | Print the mandate, date and sign it, then upload a scan or photo here. | Stampate il mandato, datatelo e firmatelo, poi caricate qui la scansione o la foto. |  |
| `account.mandateAwaitingBody.B2B` | Imprimez le mandat, datez-le et signez-le, puis déposez ici son scan ou sa photo. Déclarez-le aussi à votre banque : un prélèvement interentreprises n’est accepté qu’une fois le mandat enregistré chez elle. | Print the mandate, date and sign it, then upload a scan or photo here. Also register it with your bank: a business-to-business direct debit is only accepted once your bank has the mandate on record. | Stampate il mandato, datatelo e firmatelo, poi caricate qui la scansione o la foto. Registratelo anche presso la vostra banca: un addebito B2B è accettato solo quando la banca ha registrato il mandato. |  |
| `account.mandateInReviewBody` | Nous vérifions le mandat signé : il sera actif dès que notre service l’aura relu. Vous pouvez encore remplacer le fichier déposé. | We are checking the signed mandate: it becomes active once our team has reviewed it. You can still replace the uploaded file. | Stiamo verificando il mandato firmato: sarà attivo appena il nostro servizio lo avrà controllato. Potete ancora sostituire il file caricato. |  |
| `account.mandateActiveBody` | Vos prélèvements s’appuient sur ce mandat. Pour changer de compte bancaire, contactez le service commercial. | Your direct debits rely on this mandate. To change bank account, contact the sales team. | I vostri addebiti si basano su questo mandato. Per cambiare conto bancario, contattate il servizio commerciale. |  |
| `account.mandateDrop` | Déposer le mandat signé | Upload the signed mandate | Carica il mandato firmato |  |
| `account.mandateDropReplace` | Remplacer le fichier déposé | Replace the uploaded file | Sostituisci il file caricato |  |
| `account.mandateDropHint` | PDF ou photo (JPEG, PNG, HEIC), 10 Mo au plus. | PDF or photo (JPEG, PNG, HEIC), 10 MB max. | PDF o foto (JPEG, PNG, HEIC), massimo 10 MB. |  |
| `account.mandateUploading` | Envoi du mandat… | Uploading the mandate… | Invio del mandato… |  |
| `account.mandateUploadedToast` | Mandat signé reçu. | Signed mandate received. | Mandato firmato ricevuto. |  |
| `account.mandateBlockedLead` | Pour générer votre mandat, il manque : | To generate your mandate, we still need: | Per generare il mandato manca: |  |
| `account.mandateBlockers.bank_account_missing` | votre RIB | your bank details | le coordinate bancarie |  |
| `account.mandateBlockers.issuer_missing` | nos coordonnées de créancier — nous nous en occupons | our creditor details — we are taking care of it | i nostri dati di creditore — ce ne occupiamo noi |  |
| `account.mandateBlockers.company_name_missing` | la raison sociale de votre entreprise | your company’s registered name | la ragione sociale della sua impresa |  |
| `account.mandateBlockers.siren_missing` | le SIREN de votre entreprise | your company’s SIREN number | il numero SIREN della sua impresa |  |
| `account.mandateBlockers.holder_legal_form_missing` | la civilité ou forme juridique du titulaire du compte | the account holder’s title or legal form | il titolo o la forma giuridica del titolare del conto |  |
| `account.mandateBlockersIdentity` | Compléter l’identité légale | Complete legal identity | Completa l’identità legale |  |
| `account.mandateBlockersBank` | Compléter le RIB | Complete bank details | Completa le coordinate bancarie |  |
| `account.mandateGenerateFailed` | Le mandat n’a pas été généré. | The mandate was not generated. | Il mandato non è stato generato. |  |
| `account.mandateUploadFailed` | Le mandat signé n’a pas été déposé. | The signed mandate was not uploaded. | Il mandato firmato non è stato caricato. |  |
| `account.mandateFetchFailed` | Le mandat n’a pas pu être ouvert. Réessayez dans un instant. | The mandate could not be opened. Try again in a moment. | Il mandato non è stato aperto. Riprovate tra un istante. |  |
| `account.mandateEsign` | Utiliser la signature électronique | Use electronic signature | Usa la firma elettronica |  |
| `account.mandateEsignSoon` | Bientôt disponible | Coming soon | Presto disponibile |  |
| `account.mandateOptions` | Options du mandat | Mandate options | Opzioni del mandato |  |
| `account.mandateOptionsSubtitle` | Code débiteur et numéro de contrat | Debtor code and contract number | Codice debitore e numero di contratto |  |
| `account.mandateOptionsNotice` | Ces deux zones sont facultatives : aucune ne conditionne la validité du mandat, et les laisser vides est parfaitement normal. | Both fields are optional: neither affects the validity of the mandate, and leaving them empty is perfectly normal. | Questi due campi sono facoltativi: nessuno condiziona la validità del mandato, e lasciarli vuoti è del tutto normale. |  |
| `account.mandateOptionsDraftWarning` | Modifier ces zones annule le mandat en attente de signature : il faudra le générer à nouveau. | Changing these fields cancels the mandate awaiting signature: you will need to generate it again. | Modificare questi campi annulla il mandato in attesa di firma: bisognerà generarlo di nuovo. |  |
| `account.mandateOptionsForm.debtorReference` | Code identifiant du débiteur | Debtor identification code | Codice identificativo del debitore |  |
| `account.mandateOptionsForm.debtorReferenceHint` | La référence que vous voulez voir revenir sur vos relevés bancaires. | The reference you want to see on your bank statements. | Il riferimento che volete ritrovare sui vostri estratti conto. |  |
| `account.mandateOptionsForm.contractNumber` | Numéro du contrat | Contract number | Numero del contratto |  |
| `account.mandateOptionsForm.contractNumberHint` | Facultatif. | Optional. | Facoltativo. |  |
| `account.mandateOptionsLoading` | Lecture des options du mandat… | Reading the mandate options… | Lettura delle opzioni del mandato… |  |
| `account.mandateOptionsLoadFailedTitle` | Les options du mandat n’ont pas pu être lues | The mandate options could not be read | Le opzioni del mandato non sono state lette |  |
| `account.mandateOptionsNoBank` | Enregistrez d’abord votre RIB : ces zones s’y rattachent. | Save your bank details first: these fields belong to them. | Registrate prima le coordinate bancarie: questi campi vi si collegano. |  |
| `account.mandateOptionsSave` | Enregistrer les options | Save the options | Registra le opzioni |  |
| `account.mandateOptionsSavedToast` | Options du mandat enregistrées. | Mandate options saved. | Opzioni del mandato registrate. |  |
| `account.mandateOptionsSaveFailed` | Les options du mandat n’ont pas été enregistrées. | The mandate options were not saved. | Le opzioni del mandato non sono state registrate. |  |
| `account.completion.countOne` | 1 élément à compléter | 1 item to complete | 1 elemento da completare |  |
| `account.completion.count` | {n} éléments à compléter | {n} items to complete | {n} elementi da completare | `{n}` |
| `account.completion.blocksActivation` | Empêche l’activation : {detail} | Prevents activation: {detail} | Impedisce l’attivazione: {detail} | `{detail}` |
| `account.completion.optionalNote` | n’empêche pas l’activation | does not prevent activation | non impedisce l’attivazione |  |
| `account.completion.cardLead` | À compléter : | To complete: | Da completare: |  |
| `account.completion.mandateFields` | Pour générer votre mandat SEPA : {fields}. | To generate your SEPA mandate: {fields}. | Per generare il vostro mandato SEPA: {fields}. | `{fields}` |
| `account.completion.items.identity.title` | Identité légale | Legal identity | Identità legale |  |
| `account.completion.items.identity.detail` | La raison sociale, la forme juridique ou le SIRET manquent. | The company name, legal form or SIRET is missing. | Mancano la ragione sociale, la forma giuridica o il SIRET. |  |
| `account.completion.items.identity.action` | Compléter l’identité | Complete the identity | Completare l’identità |  |
| `account.completion.items.vat.title` | Numéro de TVA | VAT number | Partita IVA |  |
| `account.completion.items.vat.detail` | Votre numéro de TVA intracommunautaire est requis. | Your intra-community VAT number is required. | È richiesta la vostra partita IVA intracomunitaria. |  |
| `account.completion.items.vat.action` | Renseigner la TVA | Enter the VAT number | Indicare la partita IVA |  |
| `account.completion.items.telephone.title` | Numéro joignable | Phone number | Numero di telefono |  |
| `account.completion.items.telephone.detail` | Un livreur doit pouvoir appeler : renseignez un téléphone, le vôtre ou celui d’un contact. | A driver must be able to call: enter a phone number, yours or a contact’s. | Un corriere deve poter chiamare: indicate un telefono, il vostro o quello di un contatto. |  |
| `account.completion.items.telephone.action` | Ajouter un numéro | Add a number | Aggiungere un numero |  |
| `account.completion.items.billing.title` | Adresse de facturation | Billing address | Indirizzo di fatturazione |  |
| `account.completion.items.billing.detail` | Vos factures ont besoin d’une adresse. | Your invoices need an address. | Le vostre fatture hanno bisogno di un indirizzo. |  |
| `account.completion.items.billing.action` | Ajouter la facturation | Add the billing address | Aggiungere la fatturazione |  |
| `account.completion.items.delivery.title` | Adresse de livraison | Delivery address | Indirizzo di consegna |  |
| `account.completion.items.delivery.detail` | Vous préférez être livré : ajoutez au moins une adresse de livraison. | You prefer delivery: add at least one delivery address. | Preferite la consegna: aggiungete almeno un indirizzo di consegna. |  |
| `account.completion.items.delivery.action` | Ajouter une livraison | Add a delivery address | Aggiungere una consegna |  |
| `account.completion.items.kbis.title` | Extrait KBIS | KBIS extract | Visura KBIS |  |
| `account.completion.items.kbis.detail` | Déposez l’extrait KBIS de votre entreprise. | Upload your company’s KBIS extract. | Caricate la visura KBIS della vostra impresa. |  |
| `account.completion.items.kbis.action` | Déposer le KBIS | Upload the KBIS | Caricare il KBIS |  |
| `account.completion.items.bank.title` | RIB | Bank details | Coordinate bancarie |  |
| `account.completion.items.bank.detail` | Votre RIB est incomplet. | Your bank details are incomplete. | Le vostre coordinate bancarie sono incomplete. |  |
| `account.completion.items.bank.action` | Compléter le RIB | Complete the bank details | Completare le coordinate |  |
| `account.supportTitle` | Contacter le service commercial | Contact our sales team | Contattare il servizio commerciale |  |
| `account.supportPanelTitle` | Service commercial | Sales team | Servizio commerciale |  |
| `account.supportBody` | Une question sur votre compte, une commande ou une facture : nous vous répondons. | A question about your account, an order or an invoice: we will get back to you. | Una domanda sul vostro conto, un ordine o una fattura: vi rispondiamo. |  |
| `account.invoices.loading` | Lecture de vos factures… | Loading your invoices… | Lettura delle fatture… |  |
| `account.invoices.loadFailedTitle` | Impossible de lire vos factures | Your invoices could not be loaded | Impossibile leggere le fatture |  |
| `account.invoices.loadFailedBody` | La lecture a échoué — vos factures, elles, sont intactes. | Loading failed — your invoices themselves are intact. | La lettura non è riuscita — le fatture, invece, sono intatte. |  |
| `account.invoices.title` | Mes factures | My invoices | Le mie fatture |  |
| `account.invoices.lead` | Vos factures et avoirs, leur règlement, et leurs PDF. | Your invoices and credit notes, their payment, and their PDFs. | Le fatture e le note di credito, il loro pagamento e i loro PDF. |  |
| `account.invoices.noneTitle` | Aucune facture | No invoice | Nessuna fattura |  |
| `account.invoices.none` | Aucune facture pour l’instant. La facture du mois est émise le dernier jour du mois. | No invoice yet. The monthly invoice is issued on the last day of the month. | Nessuna fattura per ora. La fattura del mese è emessa l’ultimo giorno del mese. |  |
| `account.invoices.noneFilteredTitle` | Aucune pièce pour ces filtres | Nothing matches these filters | Nessun documento per questi filtri |  |
| `account.invoices.noneFiltered` | Changez l’année, le mois ou le type pour en voir d’autres. | Change the year, month or type to see others. | Cambia anno, mese o tipo per vederne altri. |  |
| `account.invoices.forbiddenTitle` | Factures réservées | Invoices are restricted | Fatture riservate |  |
| `account.invoices.forbidden` | Seuls le titulaire du compte et le contact comptabilité voient les factures de la société. | Only the account holder and the billing contact can see the company’s invoices. | Solo il titolare del conto e il contatto amministrativo vedono le fatture della società. |  |
| `account.invoices.dueTitle` | Total dû | Amount due | Totale dovuto |  |
| `account.invoices.dueCount` | {n} factures à prélever | {n} invoices to be debited | {n} fatture da addebitare | `{n}` |
| `account.invoices.dueCountOne` | 1 facture à prélever | 1 invoice to be debited | 1 fattura da addebitare |  |
| `account.invoices.dueNothing` | Rien à régler pour l’instant. | Nothing to pay for now. | Niente da pagare per ora. |  |
| `account.invoices.dueRejected` | dont {n} rejetées ({amount}) — à régulariser | of which {n} rejected ({amount}) — to be settled | di cui {n} respinte ({amount}) — da regolarizzare | `{n}` `{amount}` |
| `account.invoices.dueRejectedOne` | dont 1 rejetée ({amount}) — à régulariser | of which 1 rejected ({amount}) — to be settled | di cui 1 respinta ({amount}) — da regolarizzare | `{amount}` |
| `account.invoices.dueNote` | L’état de votre compte : ce total ne suit pas les filtres. Les avoirs n’en sont pas déduits. | The state of your account: this total ignores the filters. Credit notes are not deducted. | Lo stato del conto: questo totale non segue i filtri. Le note di credito non vengono detratte. |  |
| `account.invoices.creditNotesShown` | {n} avoirs dans la liste : {amount} | {n} credit notes in the list: {amount} | {n} note di credito nell’elenco: {amount} | `{n}` `{amount}` |
| `account.invoices.creditNotesShownOne` | 1 avoir dans la liste : {amount} | 1 credit note in the list: {amount} | 1 nota di credito nell’elenco: {amount} | `{amount}` |
| `account.invoices.filterYear` | Année | Year | Anno |  |
| `account.invoices.filterMonth` | Mois | Month | Mese |  |
| `account.invoices.filterKind` | Pièces | Documents | Documenti |  |
| `account.invoices.allYears` | Toutes | All | Tutti |  |
| `account.invoices.allMonths` | Tous | All | Tutti |  |
| `account.invoices.kindAll` | Tout | All | Tutto |  |
| `account.invoices.kindInvoices` | Factures | Invoices | Fatture |  |
| `account.invoices.kindCreditNotes` | Avoirs | Credit notes | Note di credito |  |
| `account.invoices.colNumber` | Numéro | Number | Numero |  |
| `account.invoices.colKind` | Type | Type | Tipo |  |
| `account.invoices.colPeriod` | Période | Period | Periodo |  |
| `account.invoices.colIssued` | Émise le | Issued on | Emessa il |  |
| `account.invoices.colTotal` | TTC | Incl. VAT | IVA incl. |  |
| `account.invoices.colStatus` | Statut | Status | Stato |  |
| `account.invoices.colActions` | Pièce | Document | Documento |  |
| `account.invoices.statusCardPaid` | Acquittée par carte | Paid by card | Pagata con carta |  |
| `account.invoices.statusCollectionPlanned` | Prélèvement prévu | Direct debit scheduled | Addebito previsto |  |
| `account.invoices.statusCollected` | Prélevée | Debited | Addebitata |  |
| `account.invoices.statusRejected` | Prélèvement rejeté — à régulariser | Direct debit rejected — to be settled | Addebito respinto — da regolarizzare |  |
| `account.invoices.statusRecollectionPlanned` | Nouveau prélèvement prévu | New direct debit scheduled | Nuovo addebito previsto |  |
| `account.invoices.statusSettled` | Réglée | Settled | Saldata |  |
| `account.invoices.statusClosed` | Clôturée | Closed | Chiusa |  |
| `account.invoices.statusProcessing` | En cours de traitement | Being processed | In lavorazione |  |
| `account.invoices.processingHint` | notre équipe s’en occupe | our team is on it | se ne occupa il nostro team |  |
| `account.invoices.statusOn` | le {date} | on {date} | il {date} | `{date}` |
| `account.invoices.rejectedWith` | rejeté avec {n} autres factures du même prélèvement | rejected with {n} other invoices of the same debit | respinto con altre {n} fatture dello stesso addebito | `{n}` |
| `account.invoices.rejectedWithOne` | rejeté avec 1 autre facture du même prélèvement | rejected with 1 other invoice of the same debit | respinto con un’altra fattura dello stesso addebito |  |
| `account.invoices.noStatus` | — | — | — |  |
| `account.invoices.download` | PDF | PDF | PDF |  |
| `account.invoices.selectRow` | Sélectionner {number} | Select {number} | Seleziona {number} | `{number}` |
| `account.invoices.selectAll` | Tout sélectionner | Select all | Seleziona tutto |  |
| `account.invoices.downloadSelection` | Télécharger la sélection ({n}) | Download the selection ({n}) | Scarica la selezione ({n}) | `{n}` |
| `account.invoices.downloadShown` | Télécharger tout ce qui est affiché | Download everything shown | Scarica tutto ciò che è visualizzato |  |
| `account.invoices.archiveFailed` | Le zip n’a pas pu être préparé. Réessayez dans un instant. | The zip could not be prepared. Please try again in a moment. | Impossibile preparare lo zip. Riprova tra un istante. |  |
| `account.invoices.invoice` | Facture | Invoice | Fattura |  |
| `account.invoices.creditNote` | Avoir | Credit note | Nota di credito |  |
| `account.invoices.issuedOn` | émise le {date} | issued on {date} | emessa il {date} | `{date}` |
| `account.invoices.dueOn` | échéance le {date} | due on {date} | scadenza il {date} | `{date}` |
| `account.invoices.period` | commandes de {period} | orders of {period} | ordini di {period} | `{period}` |
| `account.invoices.corrects` | corrige la facture {number} | corrects invoice {number} | rettifica la fattura {number} | `{number}` |
| `account.invoices.open` | Voir | View | Apri |  |
| `account.invoices.close` | Fermer | Close | Chiudi |  |
| `account.invoices.detailLoading` | Lecture de la facture… | Loading the invoice… | Lettura della fattura… |  |
| `account.invoices.detailFailed` | Impossible de lire cette facture. Réessayez dans un instant. | This invoice could not be loaded. Please try again in a moment. | Impossibile leggere questa fattura. Riprova tra un istante. |  |
| `account.invoices.seller` | Émise par | Issued by | Emessa da |  |
| `account.invoices.buyer` | Adressée à | Billed to | Intestata a |  |
| `account.invoices.lines` | Lignes | Lines | Righe |  |
| `account.invoices.quantity` | Quantité | Quantity | Quantità |  |
| `account.invoices.unitPrice` | Prix unitaire HT | Unit price excl. VAT | Prezzo unitario IVA esclusa |  |
| `account.invoices.amount` | Montant HT | Amount excl. VAT | Importo IVA esclusa |  |
| `account.invoices.vatRate` | TVA {rate} | VAT {rate} | IVA {rate} | `{rate}` |
| `account.invoices.goods` | Marchandises HT | Goods excl. VAT | Merci IVA esclusa |  |
| `account.invoices.allowances` | Remises | Discounts | Sconti |  |
| `account.invoices.charges` | Frais | Charges | Spese |  |
| `account.invoices.taxableBase` | Base imposable | Taxable base | Imponibile |  |
| `account.invoices.vat` | TVA | VAT | IVA |  |
| `account.invoices.totalHt` | Total HT | Total excl. VAT | Totale IVA esclusa |  |
| `account.invoices.totalVat` | Total TVA | Total VAT | Totale IVA |  |
| `account.invoices.totalTtc` | Total TTC | Total incl. VAT | Totale IVA inclusa |  |
| `account.invoices.mentions` | Mentions | Terms | Condizioni |  |
| `account.invoices.latePenalty` | Pénalités de retard | Late payment penalties | Penali di mora |  |
| `account.invoices.recoveryIndemnity` | Indemnité forfaitaire de recouvrement | Fixed recovery indemnity | Indennità forfettaria di recupero |  |
| `account.invoices.earlyDiscount` | Escompte pour paiement anticipé | Early payment discount | Sconto per pagamento anticipato |  |
| `account.invoices.payment` | Règlement | Payment | Pagamento |  |
| `account.invoices.directDebit` | Prélèvement SEPA, mandat {rum} | SEPA direct debit, mandate {rum} | Addebito diretto SEPA, mandato {rum} | `{rum}` |
| `account.invoices.paidByCard` | Acquittée par carte le {date} | Paid by card on {date} | Pagata con carta il {date} | `{date}` |
| `account.invoices.orders` | Commandes facturées | Invoiced orders | Ordini fatturati |  |
| `account.invoices.received` | reçue le {date} | received on {date} | ricevuta il {date} | `{date}` |
| `account.invoices.notReceived` | réception non constatée | receipt not recorded | ricezione non registrata |  |
| `account.invoices.pdfPending` | Le PDF de la facture est en préparation : il sera téléchargeable ici dans quelques minutes. Les informations ci-dessous sont celles de la facture émise. | The PDF of this invoice is being prepared: it will be available here in a few minutes. The details below are those of the issued invoice. | Il PDF della fattura è in preparazione: sarà scaricabile qui tra qualche minuto. I dati qui sotto sono quelli della fattura emessa. |  |
| `account.invoices.downloadPdf` | Télécharger le PDF | Download the PDF | Scarica il PDF |  |
| `account.invoices.downloadFailed` | Le PDF n’a pas pu être téléchargé. Réessayez dans un instant. | The PDF could not be downloaded. Please try again in a moment. | Impossibile scaricare il PDF. Riprova tra un istante. |  |

<a id="espace-pro"></a>

### Le compte pro — le dictionnaire général — `pro`

Source : `fr.ts · en.ts · it.ts` · 8 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `pro.title` | Intéressé par l’espace pro ? | Interested in a trade account ? | Ti interessa lo spazio professionale ? |  |
| `pro.bookedTitle` | Rappel demandé | Call requested | Richiamo richiesto |  |
| `pro.pitch` | Tarifs négociés, livraison en station, facturation mensuelle. On vous explique en deux minutes. | Negotiated prices, resort delivery, monthly invoicing. We’ll explain in two minutes. | Prezzi concordati, consegna in stazione, fatturazione mensile. Te lo spieghiamo in due minuti. |  |
| `pro.cta` | Demander à être rappelé | Ask us to call you | Chiedi di essere richiamato |  |
| `pro.openAccount` | Ouvrir mon compte pro | Open my trade account | Apri il mio account professionale |  |
| `pro.booked` | Rappel demandé · {slot} | Call requested · {slot} | Richiamo richiesto · {slot} | `{slot}` |
| `pro.at` | Au | On | Al |  |
| `pro.cancel` | Annuler | Cancel | Annulla |  |

<a id="espace-proaccount"></a>

### Le compte pro — l’écran — `proAccount`

Source : `screens/pro-account.copy.ts` · 27 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `proAccount.door.kicker` | Espace pro | Trade account | Area professionisti |  |
| `proAccount.door.heading` | Ouvrez le compte de votre établissement. | Open your venue’s account. | Aprite l’account del vostro locale. |  |
| `proAccount.door.intro` | Cinq informations, un mot de passe, et votre espace est prêt. | Five details, a password, and your space is ready. | Cinque informazioni, una password, e il vostro spazio è pronto. |  |
| `proAccount.door.eyebrow` | Ouvrir mon compte pro | Open my trade account | Aprire il mio account pro |  |
| `proAccount.door.pitch` | Qui vous êtes, et le nom de votre établissement. Le reste du dossier se complète ensuite, depuis Mon compte. | Who you are, and your venue’s name. The rest of the file can be completed later, from My account. | Chi siete e il nome del vostro locale. Il resto della pratica si completa dopo, da Il mio account. |  |
| `proAccount.door.submit` | Créer mon compte pro | Create my trade account | Crea il mio account pro |  |
| `proAccount.door.alreadyLead` | Déjà client ? | Already a customer? | Già cliente? |  |
| `proAccount.door.alreadyLink` | Se connecter | Sign in | Accedi |  |
| `proAccount.door.fine` | Aucun document n’est demandé à l’ouverture : le KBIS se dépose ensuite depuis Mon compte. | No documents are needed to open the account: the company registration can be uploaded later from My account. | Nessun documento richiesto all’apertura: la visura si carica dopo, da Il mio account. |  |
| `proAccount.door.proof.0` | Des remises dès la première commande. | Trade rates from your very first order. | Sconti fin dal primo ordine. |  |
| `proAccount.door.proof.1` | Vos paniers récurrents, retrouvés d’une fois sur l’autre. | Your recurring baskets, found again next time. | I vostri carrelli ricorrenti, ritrovati ogni volta. |  |
| `proAccount.door.proof.2` | Facturation mensuelle sur demande. | Monthly invoicing on request. | Fatturazione mensile su richiesta. |  |
| `proAccount.door.callbackTitle` | Une question sur le compte pro ? | A question about the trade account ? | Una domanda sull’account pro ? |  |
| `proAccount.door.callbackPitch` | On vous rappelle depuis le fournil et on ouvre le dossier avec vous. Ça ne retarde rien : vous pouvez envoyer le formulaire sans attendre. | We call you back from the bakery and open the file with you. It delays nothing: you can send the form without waiting. | Vi richiamiamo dal forno e apriamo la pratica con voi. Non ritarda nulla: potete inviare il modulo senza aspettare. |  |
| `proAccount.fields.firstName` | Prénom | First name | Nome |  |
| `proAccount.fields.lastName` | Nom | Last name | Cognome |  |
| `proAccount.fields.email` | E-mail | Email | E-mail |  |
| `proAccount.fields.emailPlaceholder` | vous@exemple.fr | you@example.com | voi@esempio.it |  |
| `proAccount.fields.phone` | Téléphone | Phone | Telefono |  |
| `proAccount.fields.phonePlaceholder` | 06 00 00 00 00 | +33 6 00 00 00 00 | +39 300 000 0000 |  |
| `proAccount.fields.phoneHint` | Pour qu’un livreur qui cherche la porte puisse appeler. | So a driver looking for the door can call. | Perché un fattorino che cerca la porta possa chiamare. |  |
| `proAccount.fields.enseigne` | Enseigne | Venue name | Insegna |  |
| `proAccount.fields.enseignePlaceholder` | Le nom de votre établissement | The name of your venue | Il nome del vostro locale |  |
| `proAccount.dossier.title` | Compléter mon dossier | Complete my file | Completa la pratica |  |
| `proAccount.dossier.subtitle` | Votre établissement | Your venue | Il vostro locale |  |
| `proAccount.dossier.pitch` | Il nous manque de quoi ouvrir le dossier de votre établissement. Une fois envoyé, nous le vérifions. | We still need a few details to open your venue’s file. Once sent, we review it. | Ci mancano alcuni dati per aprire la pratica del vostro locale. Una volta inviata, la verifichiamo. |  |
| `proAccount.dossier.submit` | Envoyer mon dossier | Send my file | Invia la pratica |  |

<a id="espace-deliveryprocedure"></a>

### La procédure de livraison d’une adresse — `deliveryProcedure`

Source : `screens/delivery-procedure.copy.ts · .fr/.en/.it.ts` · 47 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `deliveryProcedure.entry` | Procédure de livraison | Delivery procedure | Procedura di consegna |  |
| `deliveryProcedure.toWrite` | à rédiger | to be written | da redigere |  |
| `deliveryProcedure.stepsNone` | aucune étape | no steps | nessun passaggio |  |
| `deliveryProcedure.stepsOne` | 1 étape | 1 step | 1 passaggio |  |
| `deliveryProcedure.steps` | {n} étapes | {n} steps | {n} passaggi | `{n}` |
| `deliveryProcedure.removeBusy` | Suppression… | Deleting… | Eliminazione… |  |
| `deliveryProcedure.removeGroup` | Confirmer la suppression de l’étape | Confirm deleting the step | Confermare l’eliminazione del passaggio |  |
| `deliveryProcedure.editor.loading` | Chargement de la procédure… | Loading the procedure… | Caricamento della procedura… |  |
| `deliveryProcedure.editor.loadError` | La procédure de livraison n’a pas pu être chargée. | The delivery procedure could not be loaded. | Impossibile caricare la procedura di consegna. |  |
| `deliveryProcedure.editor.retry` | Réessayer | Try again | Riprova |  |
| `deliveryProcedure.editor.emptyTitle` | Aucune procédure de livraison | No delivery procedure | Nessuna procedura di consegna |  |
| `deliveryProcedure.editor.emptySubtitleEditable` | Décrivez, étape par étape, comment le livreur dépose la marchandise à cette adresse. | Describe, step by step, how the driver drops off the goods at this address. | Descrivete, passaggio per passaggio, come il corriere consegna la merce a questo indirizzo. |  |
| `deliveryProcedure.editor.emptySubtitleReadOnly` | Aucune étape n’a été décrite pour cette adresse. | No steps have been described for this address. | Nessun passaggio è stato descritto per questo indirizzo. |  |
| `deliveryProcedure.editor.addStep` | Ajouter une étape | Add a step | Aggiungi un passaggio |  |
| `deliveryProcedure.editor.limitReached` | Une procédure compte au plus 20 étapes. | A procedure has at most 20 steps. | Una procedura conta al massimo 20 passaggi. |  |
| `deliveryProcedure.editor.moveUp` | Monter l’étape | Move step up | Sposta su il passaggio |  |
| `deliveryProcedure.editor.moveDown` | Descendre l’étape | Move step down | Sposta giù il passaggio |  |
| `deliveryProcedure.editor.revise` | Refaire | Redo | Rifai |  |
| `deliveryProcedure.editor.conflict` | La procédure a changé entre-temps : elle vient d’être rechargée. | The procedure changed in the meantime: it has just been reloaded. | La procedura è cambiata nel frattempo: è appena stata ricaricata. |  |
| `deliveryProcedure.editor.writeFailed` | L’enregistrement a échoué. Réessayez. | Saving failed. Please try again. | Salvataggio non riuscito. Riprovate. |  |
| `deliveryProcedure.editor.newStepHeading` | Nouvelle étape | New step | Nuovo passaggio |  |
| `deliveryProcedure.editor.save` | Enregistrer | Save | Salva |  |
| `deliveryProcedure.editor.add` | Ajouter l’étape | Add the step | Aggiungi il passaggio |  |
| `deliveryProcedure.editor.cancel` | Annuler | Cancel | Annulla |  |
| `deliveryProcedure.editor.removeTitle` | Supprimer cette étape | Delete this step | Elimina questo passaggio |  |
| `deliveryProcedure.editor.removeAction` | Supprimer l’étape | Delete the step | Elimina il passaggio |  |
| `deliveryProcedure.editor.removeExplanation` | L’étape est supprimée définitivement, photo comprise. Les suivantes remontent d’un rang. | The step is deleted permanently, photo included. The following steps move up one place. | Il passaggio viene eliminato definitivamente, foto compresa. I successivi salgono di una posizione. |  |
| `deliveryProcedure.editor.removeConfirm` | Supprimer définitivement cette étape ? | Permanently delete this step? | Eliminare definitivamente questo passaggio? |  |
| `deliveryProcedure.editor.form.title` | Titre | Title | Titolo |  |
| `deliveryProcedure.editor.form.titleHint` | 80 caractères au plus — ce qu'on lit d'un coup d'œil. | 80 characters at most — what you read at a glance. | Al massimo 80 caratteri — ciò che si legge a colpo d’occhio. |  |
| `deliveryProcedure.editor.form.body` | Texte | Text | Testo |  |
| `deliveryProcedure.editor.form.bodyHint` | 1000 caractères au plus. | 1000 characters at most. | Al massimo 1000 caratteri. |  |
| `deliveryProcedure.editor.form.optional` | optionnel | optional | facoltativo |  |
| `deliveryProcedure.editor.form.photoLegend` | Photo | Photo | Foto |  |
| `deliveryProcedure.editor.form.photoHint` | Une photo de la porte, du portail ou du passage. Elle est allégée avant l’envoi. | A photo of the door, the gate or the passage. It is made lighter before sending. | Una foto della porta, del cancello o del passaggio. Viene alleggerita prima dell’invio. |  |
| `deliveryProcedure.editor.form.choosePhoto` | Choisir une photo | Choose a photo | Scegli una foto |  |
| `deliveryProcedure.editor.form.replacePhoto` | Remplacer la photo | Replace the photo | Sostituisci la foto |  |
| `deliveryProcedure.editor.form.removePhoto` | Retirer la photo | Remove the photo | Rimuovi la foto |  |
| `deliveryProcedure.editor.form.photoPreviewAlt` | Aperçu de la photo de l’étape | Preview of the step photo | Anteprima della foto del passaggio |  |
| `deliveryProcedure.editor.form.photoReducing` | Allègement de la photo… | Making the photo lighter… | Alleggerimento della foto… |  |
| `deliveryProcedure.editor.form.photoLoading` | Chargement de la photo enregistrée… | Loading the saved photo… | Caricamento della foto salvata… |  |
| `deliveryProcedure.editor.form.photoUnavailable` | La photo enregistrée n’a pas pu être affichée. Elle est conservée tant que vous ne la remplacez ni ne la retirez. | The saved photo could not be displayed. It is kept unless you replace or remove it. | Non è stato possibile mostrare la foto salvata. Resta conservata finché non la sostituisci o la rimuovi. |  |
| `deliveryProcedure.editor.form.photoTooHeavy` | Cette photo reste trop lourde, même allégée. Choisissez-en une autre, ou recadrez-la. | This photo is still too heavy, even made lighter. Choose another or crop it. | Questa foto resta troppo pesante, anche alleggerita. Sceglietene un’altra o ritagliatela. |  |
| `deliveryProcedure.editor.form.photoUnreadable` | Ce fichier n’est pas une image lisible. Choisissez une photo JPEG ou PNG. | This file is not a readable image. Choose a JPEG or PNG photo. | Questo file non è un’immagine leggibile. Scegliete una foto JPEG o PNG. |  |
| `deliveryProcedure.editor.form.titleRequired` | Le titre est requis. | The title is required. | Il titolo è obbligatorio. |  |
| `deliveryProcedure.editor.form.titleTooLong` | Le titre dépasse 80 caractères. | The title exceeds 80 characters. | Il titolo supera 80 caratteri. |  |
| `deliveryProcedure.editor.form.bodyTooLong` | Le texte dépasse 1000 caractères. | The text exceeds 1000 characters. | Il testo supera 1000 caratteri. |  |

<a id="espace-contactdialog"></a>

### Le dialogue « Nous écrire » — `contactDialog`

Source : `screens/contact-dialog.copy.ts` · 25 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `contactDialog.title` | Nous écrire | Write to us | Scriveteci |  |
| `contactDialog.subtitle` | On vous répond par e-mail, en général dans la journée. | We answer by e-mail, usually the same day. | Rispondiamo via e-mail, di solito in giornata. |  |
| `contactDialog.subject` | Objet | Subject | Oggetto |  |
| `contactDialog.subjectPlaceholder` | Choisir un objet | Choose a subject | Scegliere un oggetto |  |
| `contactDialog.name` | Votre nom | Your name | Il vostro nome |  |
| `contactDialog.email` | Votre e-mail | Your e-mail | La vostra e-mail |  |
| `contactDialog.phone` | Téléphone | Phone | Telefono |  |
| `contactDialog.phoneHint` | Si vous préférez qu’on vous rappelle. | If you would rather we call you back. | Se preferite essere richiamati. |  |
| `contactDialog.optional` | facultatif | optional | facoltativo |  |
| `contactDialog.message` | Votre message | Your message | Il vostro messaggio |  |
| `contactDialog.tooLong` | {max} caractères au plus. | {max} characters at most. | {max} caratteri al massimo. | `{max}` |
| `contactDialog.cancel` | Annuler | Cancel | Annulla |  |
| `contactDialog.send` | Envoyer | Send | Invia |  |
| `contactDialog.sending` | Envoi… | Sending… | Invio… |  |
| `contactDialog.sent` | Message envoyé | Message sent | Messaggio inviato |  |
| `contactDialog.refused` | Le message n’est pas parti. Réessayez dans un instant. | The message was not sent. Please try again in a moment. | Il messaggio non è partito. Riprovate tra un istante. |  |
| `contactDialog.loading` | Chargement des objets… | Loading subjects… | Caricamento degli oggetti… |  |
| `contactDialog.loadFailed` | Les objets de message n’ont pas pu être lus. | The message subjects could not be loaded. | Non è stato possibile leggere gli oggetti del messaggio. |  |
| `contactDialog.retry` | Réessayer | Try again | Riprova |  |
| `contactDialog.noSubjectTitle` | Aucun objet proposé | No subject available | Nessun oggetto proposto |  |
| `contactDialog.noSubjectSubtitle` | Appelez-nous : on décroche de 7 h à 19 h. | Give us a call: we pick up from 7 am to 7 pm. | Chiamateci: rispondiamo dalle 7 alle 19. |  |
| `contactDialog.callTitle` | Nous appeler | Call us | Chiamateci |  |
| `contactDialog.callSubtitle` | Choisissez qui vous voulez joindre. | Choose who you would like to reach. | Scegliete chi volete contattare. |  |
| `contactDialog.callClose` | Fermer | Close | Chiudi |  |
| `contactDialog.callWrite` | Écrire plutôt | Write instead | Scrivere invece |  |

<a id="espace-legaldocument"></a>

### Les documents légaux — `legalDocument`

Source : `fr.ts · en.ts · it.ts` · 14 textes.

| Clé | FR | EN | IT | Variables |
| --- | --- | --- | --- | --- |
| `legalDocument.close` | Fermer | Close | Chiudi |  |
| `legalDocument.loading` | Chargement du document… | Loading the document… | Caricamento del documento… |  |
| `legalDocument.errorTitle` | Document indisponible | Document unavailable | Documento non disponibile |  |
| `legalDocument.errorSubtitle` | Le document n’a pas pu être chargé. Réessayez dans un instant — ou demandez-le-nous. | The document could not be loaded. Try again in a moment — or just ask us. | Non è stato possibile caricare il documento. Riprova tra un istante — o scrivici. |  |
| `legalDocument.retry` | Réessayer | Try again | Riprova |  |
| `legalDocument.emptyTitle` | Document non publié | Not published yet | Documento non pubblicato |  |
| `legalDocument.emptySubtitle` | Cette mention ne porte encore aucun article. | This notice does not carry any clause yet. | Questa informativa non contiene ancora alcun articolo. |  |
| `legalDocument.salesTerms.pageTitle` | Conditions générales de vente | Terms and conditions of sale | Condizioni generali di vendita |  |
| `legalDocument.salesTerms.sideLabel` | Conditions pour | Terms for | Condizioni per |  |
| `legalDocument.salesTerms.sideParticulier` | Particulier | Individual | Privato |  |
| `legalDocument.salesTerms.sidePro` | Pro | Business | Professionista |  |
| `legalDocument.salesTerms.downloadPdf` | Télécharger les CGV (PDF) | Download the terms (PDF) | Scarica le condizioni (PDF) |  |
| `legalDocument.salesTerms.pdfReference` | La version de référence est le document PDF ; ce texte en facilite la lecture. | The PDF document is the reference version; this text makes it easier to read. | La versione di riferimento è il documento PDF; questo testo ne facilita la lettura. |  |
| `legalDocument.salesTerms.proDraftTitle` | Conditions générales de vente professionnelles en cours de rédaction. | Business terms and conditions of sale are being drafted. | Condizioni generali di vendita professionali in corso di redazione. |  |

## Non recensé

Ces valeurs ne sont pas des chaînes : une fonction compose son texte à l'exécution, le recueil ne peut pas le recopier. Elles se reformulent dans leur fichier source.

| Clé | Nature | Source |
| --- | --- | --- |
| `deliveryProcedure.editor.stepNumber` | fonction | `screens/delivery-procedure.copy.ts · .fr/.en/.it.ts` |
| `deliveryProcedure.editor.photoAlt` | fonction | `screens/delivery-procedure.copy.ts · .fr/.en/.it.ts` |
| `deliveryProcedure.editor.reviseHeading` | fonction | `screens/delivery-procedure.copy.ts · .fr/.en/.it.ts` |
