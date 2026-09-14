# TODO — Earth Pulse nápady na budoucnost

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
