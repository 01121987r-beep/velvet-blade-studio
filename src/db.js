import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateToken, hashPassword } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDbPath = path.join(__dirname, '..', 'barber-central.sqlite');
const dbPath = process.env.DB_PATH || defaultDbPath;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shop_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      shop_name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      logo_url TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      opening_note TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price REAL NOT NULL,
      image_url TEXT NOT NULL,
      icon TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      featured_home INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS specialists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      bio TEXT NOT NULL,
      photo_url TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS specialist_services (
      specialist_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      PRIMARY KEY (specialist_id, service_id),
      FOREIGN KEY (specialist_id) REFERENCES specialists(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS availability_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      specialist_id INTEGER NOT NULL,
      weekday INTEGER NOT NULL,
      label TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (specialist_id) REFERENCES specialists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS availability_exceptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      specialist_id INTEGER NOT NULL,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      scope TEXT NOT NULL DEFAULT 'closed_day',
      note TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (specialist_id) REFERENCES specialists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS manual_slot_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      specialist_id INTEGER NOT NULL,
      booking_date TEXT NOT NULL,
      slot_time TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'blocked_by_admin',
      FOREIGN KEY (specialist_id) REFERENCES specialists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_token TEXT UNIQUE NOT NULL,
      service_id INTEGER NOT NULL,
      specialist_id INTEGER NOT NULL,
      booking_date TEXT NOT NULL,
      booking_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_device_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      source TEXT NOT NULL DEFAULT 'app',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (service_id) REFERENCES services(id),
      FOREIGN KEY (specialist_id) REFERENCES specialists(id)
    );
  `);

  seedAdmin();
  seedSettings();
  seedServices();
  seedSpecialists();
  seedRelations();
  seedAvailability();
  migrateAvailabilityRules();
  migrateServiceIcons();
  seedBookings();
}

function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM admin_users').get().count;
  if (count > 0) return;
  db.prepare('INSERT INTO admin_users (username, password_hash, display_name) VALUES (?, ?, ?)')
    .run('admin', hashPassword('barber123'), 'Owner Barber Studio');
}

function seedSettings() {
  const row = db.prepare('SELECT id FROM shop_settings WHERE id = 1').get();
  if (row) return;
  db.prepare(`
    INSERT INTO shop_settings (id, shop_name, tagline, logo_url, phone, email, address, city, opening_note)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Velvet Blade Studio',
    'Prenotazioni rapide per grooming premium',
    '/client/assets/logo-barber.svg',
    '+39 045 8001234',
    'info@velvetblade.it',
    'Via Cappello 22',
    'Verona',
    'Mar-Sab 09:30 - 19:30'
  );
}

function seedServices() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM services').get().count;
  if (count > 0) return;
  const stmt = db.prepare(`
    INSERT INTO services (name, description, duration_minutes, price, image_url, icon, active, featured_home, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const items = [
    ['Taglio Signature', 'Taglio pulito con consulenza immagine e styling finale.', 30, 30, 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=900&q=80', '✂', 1, 1, 1],
    ['Taglio + Barba', 'Pacchetto completo con taglio e definizione barba.', 60, 52, 'https://images.unsplash.com/photo-1519500528352-2d1460418d41?auto=format&fit=crop&w=900&q=80', '✂ + 🪒', 1, 1, 2],
    ['Barba Ritual', 'Rituale barba con panni caldi e finish premium.', 30, 24, 'https://images.unsplash.com/photo-1512690459411-b0fd1c86b8d4?auto=format&fit=crop&w=900&q=80', '🪒', 1, 1, 3],
    ['Taglio Junior', 'Servizio smart dedicato ai piu piccoli.', 30, 22, 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=900&q=80', '☺', 1, 1, 4],
    ['Shave Deluxe', 'Rasatura classica con skincare e trattamento post shave.', 45, 35, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=80', '🪒', 1, 0, 5]
  ];
  const tx = db.transaction(() => items.forEach((item) => stmt.run(...item)));
  tx();
}

function seedSpecialists() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM specialists').get().count;
  if (count > 0) return;
  const stmt = db.prepare(`
    INSERT INTO specialists (name, role, bio, photo_url, active)
    VALUES (?, ?, ?, ?, ?)
  `);
  const items = [
    ['Alessio Moretti', 'Senior Barber', 'Fade netti, look classici e pulizia di linea.', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80', 1],
    ['Daniele Serra', 'Beard Specialist', 'Rituali barba, definizioni e rasature premium.', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80', 1],
    ['Nicolò Bassi', 'Style Barber', 'Texture moderne, crop e consulenza stile.', 'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=800&q=80', 1]
  ];
  const tx = db.transaction(() => items.forEach((item) => stmt.run(...item)));
  tx();
}

function seedRelations() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM specialist_services').get().count;
  if (count > 0) return;
  const services = db.prepare('SELECT id, name FROM services').all();
  const specialists = db.prepare('SELECT id, name FROM specialists').all();
  const relStmt = db.prepare('INSERT INTO specialist_services (specialist_id, service_id) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const specialist of specialists) {
      for (const service of services) {
        if (specialist.name === 'Daniele Serra' && service.name === 'Taglio Junior') continue;
        relStmt.run(specialist.id, service.id);
      }
    }
  });
  tx();
}

function seedAvailability() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM availability_rules').get().count;
  if (count > 0) return;
  const specialists = db.prepare('SELECT id, name FROM specialists').all();
  const stmt = db.prepare(`
    INSERT INTO availability_rules (specialist_id, weekday, label, start_time, end_time, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  const rows = [];
  for (const specialist of specialists) {
    if (specialist.name === 'Alessio Moretti') {
      rows.push([specialist.id, 2, 'Fascia mattina', '09:30', '13:00']);
      rows.push([specialist.id, 2, 'Fascia pomeriggio', '14:00', '19:30']);
      rows.push([specialist.id, 3, 'Fascia mattina', '09:30', '13:00']);
      rows.push([specialist.id, 3, 'Fascia pomeriggio', '14:00', '19:30']);
      rows.push([specialist.id, 5, 'Fascia continua', '10:00', '19:00']);
    }
    if (specialist.name === 'Daniele Serra') {
      rows.push([specialist.id, 2, 'Fascia pomeriggio', '12:00', '19:30']);
      rows.push([specialist.id, 4, 'Fascia mattina', '09:30', '13:00']);
      rows.push([specialist.id, 4, 'Fascia pomeriggio', '14:00', '19:30']);
      rows.push([specialist.id, 6, 'Fascia corta', '09:30', '15:00']);
    }
    if (specialist.name === 'Nicolò Bassi') {
      rows.push([specialist.id, 3, 'Fascia mattina', '10:00', '13:00']);
      rows.push([specialist.id, 3, 'Fascia pomeriggio', '14:30', '19:30']);
      rows.push([specialist.id, 5, 'Fascia mattina', '09:30', '13:00']);
      rows.push([specialist.id, 5, 'Fascia pomeriggio', '14:30', '19:30']);
      rows.push([specialist.id, 6, 'Fascia continua', '09:00', '14:00']);
    }
  }
  const tx = db.transaction(() => rows.forEach((row) => stmt.run(...row)));
  tx();
}

function migrateAvailabilityRules() {
  const fridayContinuousRules = db.prepare(`
    SELECT id, specialist_id
    FROM availability_rules
    WHERE weekday = 5 AND label = 'Fascia continua' AND start_time = '10:00' AND end_time = '19:00'
  `).all();

  if (!fridayContinuousRules.length) return;

  const insertRule = db.prepare(`
    INSERT INTO availability_rules (specialist_id, weekday, label, start_time, end_time, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  const deleteRule = db.prepare('DELETE FROM availability_rules WHERE id = ?');

  const tx = db.transaction(() => {
    for (const rule of fridayContinuousRules) {
      insertRule.run(rule.specialist_id, 5, 'Fascia mattina', '10:00', '13:00');
      insertRule.run(rule.specialist_id, 5, 'Fascia pomeriggio', '14:00', '19:00');
      deleteRule.run(rule.id);
    }
  });

  tx();
}

function migrateServiceIcons() {
  const updates = [
    ['Taglio Signature', '✂'],
    ['Taglio + Barba', '✂ + 🪒'],
    ['Barba Ritual', '🪒'],
    ['Taglio Junior', '☺'],
    ['Shave Deluxe', '🪒']
  ];

  const stmt = db.prepare('UPDATE services SET icon = ? WHERE name = ?');
  const tx = db.transaction(() => {
    for (const [name, icon] of updates) {
      stmt.run(icon, name);
    }
  });
  tx();
}

function seedBookings() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count;
  if (count > 0) return;
  const service = db.prepare('SELECT * FROM services WHERE sort_order = 1').get();
  const specialist = db.prepare('SELECT * FROM specialists WHERE name = ?').get('Alessio Moretti');
  if (!service || !specialist) return;
  const date = nextWeekday(new Date(), 2).toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO bookings (
      booking_token, service_id, specialist_id, booking_date, booking_time, end_time,
      customer_name, customer_phone, customer_device_id, status, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'seed')
  `).run(createBookingToken(), service.id, specialist.id, date, '10:00', '10:30', 'Cliente Demo', '+39 333 1112233', 'seed-device');
}

function nextWeekday(date, targetWeekday) {
  const copy = new Date(date);
  const diff = (targetWeekday + 7 - copy.getDay()) % 7 || 7;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

export function createBookingToken() {
  let token = generateToken(16);
  while (db.prepare('SELECT 1 FROM bookings WHERE booking_token = ?').get(token)) {
    token = generateToken(16);
  }
  return token;
}

export function toMinutes(timeString) {
  const [hours, minutes] = `${timeString}`.split(':').map(Number);
  return hours * 60 + minutes;
}

export function toTime(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function buildSlotsForRange(startTime, endTime, interval = 30) {
  const slots = [];
  for (let minute = toMinutes(startTime); minute + interval <= toMinutes(endTime); minute += interval) {
    slots.push(toTime(minute));
  }
  return slots;
}

export function getServiceById(serviceId) {
  return db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
}

export function getSpecialistById(specialistId) {
  return db.prepare('SELECT * FROM specialists WHERE id = ?').get(specialistId);
}

export function getWeekdayIndex(dateString) {
  return new Date(`${dateString}T12:00:00`).getDay();
}

export function getAvailabilityWindowsForDate(specialistId, dateString) {
  const weekday = getWeekdayIndex(dateString);
  const rules = db.prepare(`
    SELECT start_time, end_time, label
    FROM availability_rules
    WHERE specialist_id = ? AND weekday = ? AND active = 1
    ORDER BY start_time
  `).all(specialistId, weekday);

  const exceptions = db.prepare(`
    SELECT *
    FROM availability_exceptions
    WHERE specialist_id = ?
      AND date(?) BETWEEN date(date_from) AND date(date_to)
  `).all(specialistId, dateString);

  const fullClosure = exceptions.some((exception) => !exception.start_time && !exception.end_time);
  if (fullClosure) return [];

  if (exceptions.length > 0) {
    return exceptions
      .filter((exception) => exception.start_time && exception.end_time)
      .map((exception) => ({
        start_time: exception.start_time,
        end_time: exception.end_time,
        label: exception.scope
      }));
  }

  return rules;
}

export function getBusyRangesForDate(specialistId, dateString, ignoreBookingId = null) {
  const bookings = db.prepare(`
    SELECT id, booking_time, end_time
    FROM bookings
    WHERE specialist_id = ? AND booking_date = ? AND status = 'confirmed'
  `).all(specialistId, dateString).filter((row) => row.id !== ignoreBookingId);

  const blocks = db.prepare(`
    SELECT slot_time
    FROM manual_slot_blocks
    WHERE specialist_id = ? AND booking_date = ?
  `).all(specialistId, dateString);

  return {
    bookings,
    blocks: new Set(blocks.map((row) => row.slot_time))
  };
}

export function getAvailableStartSlots(specialistId, dateString, durationMinutes, ignoreBookingId = null) {
  const windows = getAvailabilityWindowsForDate(specialistId, dateString);
  const { bookings, blocks } = getBusyRangesForDate(specialistId, dateString, ignoreBookingId);
  const interval = 30;

  return windows
    .flatMap((window) => buildSlotsForRange(window.start_time, window.end_time, interval))
    .filter((slot) => {
      if (blocks.has(slot)) return false;
      const start = toMinutes(slot);
      const end = start + durationMinutes;
      const fitsWindow = windows.some((window) => start >= toMinutes(window.start_time) && end <= toMinutes(window.end_time));
      if (!fitsWindow) return false;
      return !bookings.some((booking) => {
        const bookingStart = toMinutes(booking.booking_time);
        const bookingEnd = toMinutes(booking.end_time);
        return start < bookingEnd && end > bookingStart;
      });
    });
}

export function getVisibleWeekDates(referenceDateString = null, totalDays = 8) {
  const today = referenceDateString ? new Date(`${referenceDateString}T12:00:00`) : new Date();
  return Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export function getShopSettings() {
  return db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();
}
