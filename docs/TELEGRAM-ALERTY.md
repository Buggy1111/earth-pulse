# 🔔 Telegram alerty na zemětřesení

Mimo aplikaci (ta zůstává čistě klientská) běží dva GitHub Actions workflowy:

| Workflow | Kdy | Co |
| --- | --- | --- |
| `quake-alert.yml` | každých ~10 min | pošle zprávu za každé nové zemětřesení, které splní pravidla |
| `quake-digest.yml` | denně 06:17 UTC | pošle souhrn za posledních 24 h |

## Zapnutí (jednou, ~5 minut)

1. V Telegramu napiš **@BotFather** → `/newbot` → dostaneš **token**. Vlastní bot,
   ne sdílený z jiného projektu.
2. Napiš svému botovi `/start` (nebo ho přidej do skupiny / kanálu).
3. **Chat ID:** otevři `https://api.telegram.org/bot<TOKEN>/getUpdates` v prohlížeči
   a najdi `"chat":{"id": …}` (pro kanál začíná `-100…`).
4. V repu: *Settings → Secrets and variables → Actions → New repository secret*:
   `TELEGRAM_BOT_TOKEN` a `TELEGRAM_CHAT_ID`.
5. Merge do `main` (plánované workflowy běží jen z výchozí větve). Zkouška bez čekání:
   *Actions → Quake alerts → Run workflow*.

První běh jen **zaznamená** aktuální stav (nic nepošle) — aby nechodil výpis posledních
hodin. Dál chodí jen nové události.

## Pravidla — `alerts.config.json`

```json
{
  "worldwideMinMagnitude": 6.5,
  "regions": [
    { "name": "Czechia + neighbours", "minMagnitude": 3.0, "circle": { "lat": 49.8, "lng": 15.5, "radiusKm": 400 } },
    { "name": "Mediterranean", "minMagnitude": 5.5, "bbox": [30, -10, 46, 40] }
  ]
}
```

- `worldwideMinMagnitude` — práh pro celý svět (`null` = vypnout).
- Region = **kruh** (`circle`) nebo **obdélník** `bbox: [jih, západ, sever, východ]`
  (přes datovou hranici stačí `západ > východ`).
- Událost s víc shodami dostane všechna jména pravidel.

## Zkouška u sebe

```bash
npm run quake-alert                      # nasucho: vypíše, co by poslal
TELEGRAM_BOT_TOKEN=… TELEGRAM_CHAT_ID=… node scripts/quake-alert.mjs --digest
```

## Jak je to postavené

- Zdroje: USGS (`all_day`) + EMSC FDSN; stejná událost z obou se pošle **jednou**.
  Výpadek jednoho zdroje druhý neumlčí.
- „Už odesláno" drží soubor `.alert-state.json` na orphan větvi `alert-state`
  (`main` zůstává čistá). Stará data (3 dny) se mažou.
- Token se nikdy nevypisuje do logu (chyby ukazují jen stav a odpověď Telegramu).
- Logika: `scripts/lib/quake-alert.mjs`, testy `src/lib/quakeAlert.test.ts`.
