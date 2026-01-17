# Ludo Online (Ki nevet a végén) – GitHub Pages + Supabase
## Ha nem enged szobat letrehozni
Ez szinte mindig 2 ok miatt van:
1) Nem irtad at a `supabase.js`-ben a `SUPABASE_URL` es `SUPABASE_ANON_KEY` ertekeket.
2) RLS tiltja az INSERT-et. Futtasd a `supabase.sql`-t (ebben DEMO-hoz RLS OFF van), vagy csinalj policy-kat.

Tipp: lokalisan ne file://-bol nyisd, hanem Live Server-rel / GitHub Pages-en.


Ez egy **teljesen működő online Ludo** alap, a kért szabályokkal:
- Szoba létrehozás + csatlakozás kóddal
- Host-only: kód + Start gomb
- 2-4 játékossal indítható
- Kocka középen, **1 mp szinkron dobás animáció** (mindenkinél egyszerre)
- Dobás után a kliens megmutatja, melyik bábu hova léphet (csak anim után)
- Ha csak 1 lépés van, **automatikusan lép** (de megvárja a dobás animot)
- 6-os → újra jössz (nincs limit)
- Ütés vagy célba érés → újra jössz (de **nem stackelődik**: egy lépés után max 1 extra)
- Start mező: **a saját szín ott safe**, más színt ott le lehet ütni
- Csillag mezők safe (alap Ludo)
- Több bábu ugyanazon a mezőn: egymás mellé zsugorítva
- Célba érés: pontos dobás, túldobásnál **visszapattan** a maradékkal
- Mindenki a saját kliensén úgy látja, hogy a **saját színe bal-lent** van (rotált view)

## 1) Supabase beállítás
1. Supabase Project létrehozás
2. SQL Editor: futtasd a `supabase.sql` tartalmát
3. Database -> Replication: kapcsold be a `ludo_rooms` táblát Realtime-hoz

### Gyors DEMO (ajánlott): RLS OFF
A legegyszerűbb, ha demohoz kikapcsolod:
```sql
alter table public.ludo_rooms disable row level security;
```

## 2) Frontend beállítás
1. Nyisd meg `supabase.js`
2. Írd be:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 3) GitHub Pages
1. Repo -> feltöltöd a fájlokat
2. Settings -> Pages -> Deploy from branch
3. Megnyitod az oldalt

## Használat
- Nyisd meg az oldalt
- Adj nevet
- "Szoba létrehozása" (host) vagy "Csatlakozás" (kóddal)
- Host nyom Start

## Megjegyzés
Ez a verzió anon kulccsal megy, tehát **nem csalásbiztos**.
Ha kell "pro" mód (auth + RPC + szerver oldali dobás), meg tudom csinálni.
