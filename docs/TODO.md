# TODO — Earth Pulse nápady na budoucnost

> **Stav 12. 10. 2026:** ✅ vše hotové — 1 Webb+Roman · 2 Telegram · 3 Roje · 4 Deník · 5 Historie · 6 Hvězdné fotky (28 hvězd) · 7 Zvuk

> Založeno 14. 9. 2026 · nápady z brainstormingu s Izy · seřazeno podle poměru hodnota/obtížnost
> **Povinnost žádná** — projekt už teď stojí; tohle je volná fifo na vonkajší nápady.

| # | Nápad | Co to je | Obtížnost | Hodnota |
|---|---|---|---|---|
| 1 | **Roman + Webb teleskopy** | Deep-space markery s vlastní trajektorií (L2 halo orbit kolem Sun-Earth L2) — mimo SGP4, vlastní propagace. Oba slavné teleskopy aktuálně chybí | střední (nový kód pro L2 orbit) | **vysoká** — "wow" moment ve Sluneční soustavě |
| 2 | **Telegram alerting** | Zemětřesení nad X magnitudy ve zvoleném regionu → Telegram zpráva. Infra už existuje (Silikon Manager má telegram modul) | **nízká** | **vysoká** — z appky udělá nástroj, ne jen vizuál |
| 3 | **Meteorické roje s předpovědí** | Perseidy, Geminidi… radiant namalovaný na obloze + odpočet k peaku. Zdroj: IMO kalendář rojů | střední | střední-vysoká ( Público appeal) |
| 4 | **Deník planety (24 h)** | Co se za 24 h stalo — zemětřesení, erupce, bouře jako jeden klik / film. Může sdílet data s alertingem (2) | nízká-střední | střední |
| 5 | **Historický režim** | Velké erupce / klimatické události jako časová osa na globusu — navazuje na Continental Drift | střední | střední |
| 6 | **Rozšíření hvězdných fotek** | Máš 13 slavných hvězd, Hubble/JWST archivy nabízí tisíce | nízká | střední |
| 7 | **Ambientní zvuk** | Dron podle aktivity planety; klidný v klidu, napjatý při katastrofě | střední (audio design) | nízká-střední (křižácký wow factor) |

## Doporučené pořadí, kdyby se dělalo

**1 + 2** (nejsilnější kombinace: wow + utilita) → pak 3 → zbytek podle chuti.

## Poznámky k implementaci

- **(1) Roman/Webb:** NASA JPL HORIZONS umí i L2 body (dal by se tahat stejným fetcherem jako probes) — možná jednodušší, než se zdá. Zkontrolovat `scripts/fetch-probes.mjs`, jestli HORIZONS podporuje L2 halo trajektorie pro -48 (Webb) / -246 (Roman).
- **(2) Alerting:** zemětřesení data už tečou z USGS+EMSC; stačí filtr magnitude + region + Telegram Bot API (token je ve vzduchu ze Silikon Manageru — ale **vlastní bot token**, ne sdílený).
- **(4) Deník:** může číst stejný USGS/EONET feed co globus — jen agregovat a serializovat.

## Hotovo (3. 10. 2026)

- **(1)** `lib/l2.ts` — vlastní halo propagace; Roman i Webb bez HORIZONS. Až
  HORIZONS Roman publikuje (id zatím neznámé), stačí přidat do `fetch-probes.mjs`
  — baked efemerida má přednost.
- **(2)** `scripts/quake-alert.mjs` + workflow. **Co musíš udělat ty:** založit
  *vlastního* bota u @BotFather a přidat repo secrets `TELEGRAM_BOT_TOKEN`
  a `TELEGRAM_CHAT_ID`; pravidla uprav v `alerts.config.json`. Bez secretů běží
  workflow jen nasucho. (Cron jede až po mergi do `main`.)
  Návod krok za krokem: `docs/TELEGRAM-ALERTY.md` (+ denní digest `quake-digest.yml`).
- **(3)(4)(5)(7)** v aplikaci — viz `docs/FUNKCE.md`.
- **(6) hotovo 12. 10. 2026:** 15 nových hvězd (28 celkem). Další přidáš tak, že v Actions
  spustíš **Star photos** (najde kandidáty s volnou licencí do `docs/star-photo-candidates.json`),
  vybereš skutečné snímky, doplníš `PHOTOS` ve `scripts/fetch-star-photos.mjs` + `STAR_PHOTOS`
  v `src/lib/starLook.ts` a workflow spustíš znovu. Test `scripts/star-photos.test.ts` hlídá,
  že každá fotka patří skutečné hvězdě z katalogu a má soubor.


---

# Aktivní TODO: stabilita, správnost dat a kvalita (13. 10. 2026)

**Cíl:** produkčně spolehlivý Earth Pulse, nikoli neověřitelný slib „dokonalosti“. Starší seznam výše popisuje již implementované funkce, ne dokončený audit. Stav hotovo znamená sloučené PR; funkčnost na fyzickém mobilu je nutné ověřit zvlášť.

## P0 — otevřené blokery a potvrzení vydání
- [ ] **HIST-01** PR #26: u Vesuvu 79 uvést datum jako sporné; potvrdit zelené CI, sloučit a zkontrolovat následné CI `main`.
- [ ] **QA-01** Po každém merge zkontrolovat CI na `main`; opravy až po diagnóze logu, žádné slepé navyšování timeoutů.
- [ ] **RELEASE-01** Reálný smoke test produkčního nasazení na Vercelu: start, Earth, Solar, Moon, Pangea, přechody, práce bez sítě a chybové stavy. CI neověřuje skutečné nasazení automaticky.

## P1 — správná data a důvěryhodnost
- [ ] **HIST-02** Inventura všech historických záznamů: datum, poloha, magnituda, počty obětí, popis, kategorie, odkazy; označit tvrzení nepodložená příslušným zdrojem.
- [ ] **HIST-03** Ke každé historické události ověřit konkrétní primární nebo odborný pramen; obecná rozcestníková stránka nestačí. Průběžně kontrolovat nefunkční odkazy.
- [ ] **HIST-04** Strukturované pole `dateCertainty` / `measurementType` / `source` a jednotná prezentace nejistot v CZ/EN; historicky sporná data nezobrazovat jako jistotu.
- [ ] **FEEDS-01** Audit aktuálnosti a výpadků USGS, EMSC, EONET, NOAA, ISS a TLE; testovat neplatná data, stale stav, fallback a jejich srozumitelné oznámení.
- [ ] **SPACE-01** Porovnat zobrazení drah, epoch a extrapolací sond a družic s referenčními hodnotami; indikovat zastaralé efemeridy a limity přesnosti.

## P1 — výkon, paměť a mobilní použitelnost
- [ ] **WEBGL-01** Změřit opakované vytváření/rušení scén: context-lost, počty canvasů, JS heap a FPS; odlišit per-renderer metriky od skutečné akumulace GPU paměti. Navázat na PR #22.
- [ ] **WEBGL-02** Audit Three.js zdrojů vč. GLB/model cache, materiálů, textur, workerů a pozdních async fetchů; cílené regresní testy.
- [ ] **MOBILE-01** Otestovat fyzicky iPhone Safari a alespoň jeden slabší Android: první start, 2K/4K, rychlé přepínání, 10min používání, paměť, zahřívání, baterie a obnovení po návratu z pozadí.
- [ ] **MOBILE-02** Audit čitelnosti, kontrastu, dotykových ploch, VoiceOver/TalkBack, ovládání drawerů, klávesnice a úsporného režimu.

## P2 — provoz, bezpečnost a předání agentům
- [ ] **PWA-01** Ověřit offline fallback, cache limity, aktualizaci service workeru a návrat online.
- [ ] **OPS-01** Audit plánovaných GitHub Actions, chyb fetch skriptů, licencí a původu dat; minimalizovat duplicitní CI a hlučné notifikace.
- [ ] **SEC-01** Prověřit závislosti, secrets, síťová oprávnění a žádné tokeny na klientovi; Telegram alerting vyžaduje vlastní GitHub secrets.
- [ ] **DOC-01** Aktualizovat README (počty událostí, testů, sond), CHANGELOG a datové zdroje podle reality v kódu.
- [ ] **QA-02** Definovat release checklist + konkrétní kritéria „hotovo“ pro každý režim a zátěžové testy.

## Už provedeno — nezaměňovat s kompletním ověřením
- [x] **WEBGL-BASE** PR #22: E2E přepínání Earth / Solar / Pangea a uvolnění kontextu na simulovaném mobilu.
- [x] **HIST-SOURCES** PR #23: konkrétní zdroje pro sedm vybraných událostí.
- [x] **HIST-CASUALTIES** PR #24: upozornění na nejisté odhady obětí Haiti 2010 a čínských povodní 1931.
- [x] **HIST-MAGNITUDES** PR #25: označení historických magnitud Shaanxi a Lisabon jako odhadů.

## Pravidla práce pro Codex / Claude Code
1. Vždy zkontroluj existující issue/PR a stav `main`, ať se práce neduplikuje.
2. Jedno zaměřené PR = jedna ověřitelná změna; nejdřív důkaz problému, pak oprava a test.
3. CI `lint → build → unit → E2E`, po mergi navíc kontrola `main`. Neprohlašuj green před dokončením.
4. Historická čísla neopravovat odhadem bez odkazu na relevantní primární či odborný zdroj.
5. Stav mobilního GPU, baterie nebo Safari neoznačovat „otestováno“, pokud neproběhl reálný test na zařízení.
