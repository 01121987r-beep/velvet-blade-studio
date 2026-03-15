# Barber Central Booking

Sistema completo di prenotazione barber shop composto da:
- app cliente Android-ready, costruita come frontend app-first
- pannello admin desktop-oriented
- backend/API centralizzato
- database persistente SQLite

## Perche questo stack
- `Node.js + Express`: leggero, rapido da evolvere e perfetto per servire API e frontend nello stesso progetto.
- `SQLite + better-sqlite3`: semplice da usare in locale e coerente con il modello centralizzato gia validato nel progetto precedente.
- `Frontend web app-first`: stessa logica dell'app Android precedente, ma con base pulita e facilmente wrappabile in Capacitor per Android.
- `Admin web separato`: tutto cio che il cliente vede dipende dal pannello admin, non da dati hardcoded lato app.

## Struttura progetto
```text
barber-central-booking/
  public/
    admin/
      index.html
      app.js
      styles.css
    client/
      index.html
      app.js
      styles.css
  src/
    auth.js
    db.js
    server.js
  docs/
    ARCHITECTURE.md
  package.json
  README.md
```

## Logica chiave
- servizi, specialisti, disponibilita, eccezioni e prenotazioni vivono nel database centrale
- il cliente carica tutto da API
- uno slot gia prenotato o bloccato da admin non compare piu come disponibile
- attivazioni/disattivazioni da admin si riflettono subito lato cliente
- le prenotazioni cliente sono collegate a un `customer_device_id` e a un `booking_token`

## Database schema sintetico
Tabelle principali:
- `shop_settings`
- `admin_users`
- `admin_sessions`
- `services`
- `specialists`
- `specialist_services`
- `availability_rules`
- `availability_exceptions`
- `manual_slot_blocks`
- `bookings`

Dettaglio completo in:
- [/Users/buscattidocet/Documents/Playground/barber-central-booking/docs/ARCHITECTURE.md](/Users/buscattidocet/Documents/Playground/barber-central-booking/docs/ARCHITECTURE.md)

## API principali
### Cliente
- `GET /api/client/bootstrap`
- `GET /api/client/services`
- `GET /api/client/services/:id/specialists`
- `GET /api/client/availability?serviceId=&specialistId=`
- `GET /api/client/bookings?deviceId=`
- `POST /api/client/bookings`
- `PATCH /api/client/bookings/:token/cancel`
- `PATCH /api/client/bookings/:token/reschedule`

### Admin
- `POST /api/admin/login`
- `GET /api/admin/bootstrap`
- `GET/POST/PUT /api/admin/services`
- `GET/POST/PUT /api/admin/specialists`
- `GET/PUT /api/admin/availability`
- `GET /api/admin/bookings`
- `PATCH /api/admin/bookings/:id/status`
- `PATCH /api/admin/bookings/:id/reschedule`
- `POST /api/admin/bookings/block-slot`
- `GET/PUT /api/admin/settings`

## Schermate principali cliente
- Home servizi con card dinamiche
- Scelta specialista
- Scelta giorno e orario nella settimana corrente
- Riepilogo prenotazione
- Conferma
- Le mie prenotazioni

## Schermate principali admin
- Login owner
- Dashboard con overview e agenda giornaliera
- Gestione servizi
- Gestione specialisti
- Gestione disponibilita ed eccezioni
- Gestione prenotazioni con filtri
- Impostazioni negozio

## Dati demo inclusi
- 5 servizi realistici
- 3 specialisti
- disponibilita settimanali demo
- una prenotazione seed
- credenziali admin demo:
  - username: `admin`
  - password: `barber123`

## Avvio locale
1. Installa dipendenze:
```bash
cd /Users/buscattidocet/Documents/Playground/barber-central-booking
npm install
```
2. Avvia il server:
```bash
npm start
```
3. Apri:
- cliente: [http://localhost:3100](http://localhost:3100)
- admin: [http://localhost:3100/admin](http://localhost:3100/admin)

## Note Android
Questa base e pronta per essere impacchettata in Android con Capacitor, seguendo lo stesso approccio dell'app precedente. Il frontend cliente e gia costruito con layout e logica app-first.
