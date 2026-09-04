-- **La dérogation d'heure limite.**
--
-- Un client appelle vingt minutes trop tard, et quelqu'un décide. Jusqu'ici ce
-- « quelqu'un » n'existait pas comme objet : le back-office passait au travers
-- de la limite par une EXEMPTION en dur dans la garde — pas de motif, pas
-- d'auteur, pas de trace, et rien pour distinguer une décision d'un oubli.
--
-- Cette table est la décision elle-même. Elle vise UN client et UNE journée
-- d'acheminement : pas « ce client est dispensé », qui serait un réglage et
-- devrait se voir comme tel.
--
-- 🔴 **Aucune heure, aucun instant d'expiration**, et c'est voulu. Sa borne est
-- la fenêtre de rattrapage, que seule la garde connaît — elle ne consulte une
-- dérogation que dans cet état. Une dérogation ne peut donc jamais ouvrir une
-- journée close, quoi qu'elle porte : la borne n'est pas vérifiée, elle est
-- inexprimable. Une colonne d'expiration aurait dû approximer une fin de grâce
-- qui n'existe pas — depuis que chaque article porte sa limite, un panier en a
-- autant que de lignes.
--
-- **Additif** : la table naît vide, et une table vide n'autorise rien. Retour
-- arrière : `DROP TABLE`, aucune autre colonne n'est lue ni réécrite.
CREATE TABLE "public"."order_cutoff_waiver" (
    "id"                  TEXT NOT NULL,
    "company_id"          TEXT NOT NULL,
    "fulfillment_date"    DATE NOT NULL,
    "reason"              TEXT NOT NULL,
    "granted_by_staff_id" TEXT NOT NULL,
    "granted_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_by_order_id"    TEXT,
    "used_at"             TIMESTAMP(3),

    CONSTRAINT "order_cutoff_waiver_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_cutoff_waiver_company_id_fulfillment_date_idx"
    ON "public"."order_cutoff_waiver" ("company_id", "fulfillment_date");

ALTER TABLE "public"."order_cutoff_waiver"
    ADD CONSTRAINT "order_cutoff_waiver_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- **Une seule autorisation OUVERTE par client et par journée.**
--
-- `@@unique` ne sait pas dire « non consommée » : il aurait interdit d'en
-- accorder une seconde après qu'une première a servi, ce qui est un cas normal
-- (deux commandes tardives le même jour, deux décisions). L'index partiel dit
-- exactement la règle — sans lui, « la » dérogation d'un client un jour donné
-- deviendrait une question de tri.
CREATE UNIQUE INDEX "order_cutoff_waiver_one_open"
    ON "public"."order_cutoff_waiver" ("company_id", "fulfillment_date")
 WHERE "used_by_order_id" IS NULL;

-- Consommée = les DEUX colonnes, ou aucune. Une commande sans instant, ou un
-- instant sans commande, décrirait une consommation dont on ne sait rien.
ALTER TABLE "public"."order_cutoff_waiver"
    ADD CONSTRAINT "order_cutoff_waiver_used_together"
    CHECK (("used_by_order_id" IS NULL) = ("used_at" IS NULL));
