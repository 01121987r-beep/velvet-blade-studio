import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  db,
  initializeDatabase,
  createBookingToken,
  getAvailableStartSlots,
  getServiceById,
  getSpecialistById,
  getVisibleWeekDates,
  getShopSettings,
  toMinutes,
  toTime,
  getAvailabilityWindowsForDate
} from './db.js';
import { generateToken, hashPassword, verifyPassword } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');
const app = express();
const PORT = process.env.PORT || 3100;
const HOST = process.env.HOST || '0.0.0.0';

initializeDatabase();

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(publicDir));

function respondError(res, status, message) {
  return res.status(status).json({ error: message });
}

function requireFields(res, fields) {
  const missing = fields.filter(([_, value]) => value === undefined || value === null || value === '');
  if (!missing.length) return null;
  return respondError(res, 400, `Campi obbligatori mancanti: ${missing.map(([key]) => key).join(', ')}`);
}

function authTokenFromRequest(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function requireAdmin(req, res, next) {
  const token = authTokenFromRequest(req);
  if (!token) return respondError(res, 401, 'Unauthorized');
  const session = db.prepare(`
    SELECT admin_sessions.*, admin_users.username, admin_users.display_name
    FROM admin_sessions
    JOIN admin_users ON admin_users.id = admin_sessions.admin_id
    WHERE admin_sessions.token = ?
  `).get(token);
  if (!session) return respondError(res, 401, 'Unauthorized');
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
    return respondError(res, 401, 'Session expired');
  }
  req.admin = session;
  next();
}

function deleteAdminSession(token) {
  if (!token) return;
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
}

function mapBookingRow(row) {
  return {
    ...row,
    status_label: row.status === 'cancelled' ? 'Annullata' : row.status === 'pending' ? 'In attesa' : 'Confermata'
  };
}

function servicePayload(body) {
  return {
    name: `${body.name || ''}`.trim(),
    description: `${body.description || ''}`.trim(),
    duration_minutes: Number(body.duration_minutes || 0),
    price: Number(body.price || 0),
    image_url: `${body.image_url || ''}`.trim(),
    icon: `${body.icon || ''}`.trim() || '✂',
    active: body.active ? 1 : 0,
    featured_home: body.featured_home ? 1 : 0,
    sort_order: Number(body.sort_order || 0)
  };
}

function specialistPayload(body) {
  return {
    name: `${body.name || ''}`.trim(),
    role: `${body.role || ''}`.trim(),
    bio: `${body.bio || ''}`.trim(),
    photo_url: `${body.photo_url || ''}`.trim(),
    active: body.active ? 1 : 0
  };
}

function getServiceCards() {
  return db.prepare(`
    SELECT *
    FROM services
    WHERE active = 1
    ORDER BY featured_home DESC, sort_order ASC, id ASC
  `).all();
}

function getSpecialistsForService(serviceId) {
  return db.prepare(`
    SELECT specialists.*
    FROM specialists
    JOIN specialist_services ON specialist_services.specialist_id = specialists.id
    WHERE specialist_services.service_id = ?
      AND specialists.active = 1
    ORDER BY specialists.name ASC
  `).all(serviceId);
}

function getBookingByToken(token) {
  return db.prepare(`
    SELECT bookings.*, services.name AS service_name, services.price, services.duration_minutes,
           specialists.name AS specialist_name, specialists.role AS specialist_role
    FROM bookings
    JOIN services ON services.id = bookings.service_id
    JOIN specialists ON specialists.id = bookings.specialist_id
    WHERE booking_token = ?
  `).get(token);
}

function getBookingsForDevice(deviceId) {
  return db.prepare(`
    SELECT bookings.*, services.name AS service_name, services.price, services.duration_minutes,
           specialists.name AS specialist_name
    FROM bookings
    JOIN services ON services.id = bookings.service_id
    JOIN specialists ON specialists.id = bookings.specialist_id
    WHERE bookings.customer_device_id = ?
    ORDER BY bookings.booking_date DESC, bookings.booking_time DESC
  `).all(deviceId).map(mapBookingRow);
}

function buildWeekAvailability(specialistId, serviceId, referenceDate) {
  const service = getServiceById(serviceId);
  if (!service) return [];
  const availableDays = [];
  const startDate = referenceDate ? new Date(`${referenceDate}T12:00:00`) : new Date();
  const cursor = new Date(startDate);
  let safetyCounter = 0;

  while (availableDays.length < 7 && safetyCounter < 365) {
    const date = cursor.toISOString().slice(0, 10);
    const slots = getAvailableStartSlots(specialistId, date, service.duration_minutes);
    if (slots.length) {
      availableDays.push({ date, slots, windows: getAvailabilityWindowsForDate(specialistId, date) });
    }
    cursor.setDate(cursor.getDate() + 1);
    safetyCounter += 1;
  }

  return availableDays;
}

function ensureServiceSpecialistLink(serviceId, specialistId) {
  const row = db.prepare(`
    SELECT 1
    FROM specialist_services
    WHERE service_id = ? AND specialist_id = ?
  `).get(serviceId, specialistId);
  return Boolean(row);
}

function createEndTime(startTime, durationMinutes) {
  return toTime(toMinutes(startTime) + durationMinutes);
}

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/client/bootstrap', (req, res) => {
  res.json({
    settings: getShopSettings(),
    services: getServiceCards().slice(0, 4)
  });
});

app.get('/api/client/services', (req, res) => {
  res.json({ services: getServiceCards() });
});

app.get('/api/client/specialists', (req, res) => {
  res.json({
    specialists: db.prepare(`
      SELECT *
      FROM specialists
      WHERE active = 1
      ORDER BY name ASC
    `).all()
  });
});

app.get('/api/client/services/:id/specialists', (req, res) => {
  const serviceId = Number(req.params.id);
  if (!serviceId) return respondError(res, 400, 'Servizio non valido');
  res.json({ specialists: getSpecialistsForService(serviceId) });
});

app.get('/api/client/availability', (req, res) => {
  const serviceId = Number(req.query.serviceId);
  const specialistId = Number(req.query.specialistId);
  const referenceDate = `${req.query.referenceDate || ''}`.trim() || undefined;
  if (!serviceId || !specialistId) return respondError(res, 400, 'serviceId e specialistId richiesti');
  if (!ensureServiceSpecialistLink(serviceId, specialistId)) return respondError(res, 400, 'Lo specialista non esegue questo servizio');
  res.json({ days: buildWeekAvailability(specialistId, serviceId, referenceDate) });
});

app.get('/api/client/bookings', (req, res) => {
  const deviceId = `${req.query.deviceId || ''}`.trim();
  if (!deviceId) return respondError(res, 400, 'deviceId richiesto');
  res.json({ bookings: getBookingsForDevice(deviceId) });
});

app.post('/api/client/bookings', (req, res) => {
  const { service_id, specialist_id, booking_date, booking_time, customer_name, customer_phone, customer_device_id } = req.body;
  const missing = requireFields(res, [
    ['service_id', service_id],
    ['specialist_id', specialist_id],
    ['booking_date', booking_date],
    ['booking_time', booking_time],
    ['customer_name', customer_name],
    ['customer_phone', customer_phone],
    ['customer_device_id', customer_device_id]
  ]);
  if (missing) return missing;

  const service = getServiceById(Number(service_id));
  const specialist = getSpecialistById(Number(specialist_id));
  if (!service || !service.active) return respondError(res, 404, 'Servizio non disponibile');
  if (!specialist || !specialist.active) return respondError(res, 404, 'Specialista non disponibile');
  if (!ensureServiceSpecialistLink(service.id, specialist.id)) return respondError(res, 400, 'Combinazione servizio/specialista non valida');

  const available = getAvailableStartSlots(specialist.id, booking_date, service.duration_minutes);
  if (!available.includes(booking_time)) return respondError(res, 409, 'Slot non piu disponibile');

  const token = createBookingToken();
  const endTime = createEndTime(booking_time, service.duration_minutes);
  db.prepare(`
    INSERT INTO bookings (
      booking_token, service_id, specialist_id, booking_date, booking_time, end_time,
      customer_name, customer_phone, customer_device_id, status, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'app')
  `).run(
    token,
    service.id,
    specialist.id,
    booking_date,
    booking_time,
    endTime,
    `${customer_name}`.trim(),
    `${customer_phone}`.trim(),
    `${customer_device_id}`.trim()
  );

  res.status(201).json({ booking: getBookingByToken(token) });
});

app.patch('/api/client/bookings/:token/cancel', (req, res) => {
  const token = `${req.params.token || ''}`.trim();
  const booking = getBookingByToken(token);
  if (!booking) return respondError(res, 404, 'Prenotazione non trovata');
  db.prepare(`UPDATE bookings SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE booking_token = ?`).run(token);
  res.json({ ok: true });
});

app.patch('/api/client/bookings/:token/reschedule', (req, res) => {
  const token = `${req.params.token || ''}`.trim();
  const { booking_date, booking_time } = req.body;
  if (!token || !booking_date || !booking_time) return respondError(res, 400, 'Dati mancanti');
  const booking = getBookingByToken(token);
  if (!booking) return respondError(res, 404, 'Prenotazione non trovata');
  const service = getServiceById(booking.service_id);
  const available = getAvailableStartSlots(booking.specialist_id, booking_date, service.duration_minutes, booking.id);
  if (!available.includes(booking_time)) return respondError(res, 409, 'Slot non piu disponibile');
  db.prepare(`
    UPDATE bookings
    SET booking_date = ?, booking_time = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
    WHERE booking_token = ?
  `).run(booking_date, booking_time, createEndTime(booking_time, service.duration_minutes), token);
  res.json({ booking: getBookingByToken(token) });
});

app.post('/api/admin/login', (req, res) => {
  const username = `${req.body.username || ''}`.trim();
  const password = `${req.body.password || ''}`;
  if (!username || !password) return respondError(res, 400, 'Username e password richiesti');
  const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!admin || !verifyPassword(password, admin.password_hash)) return respondError(res, 401, 'Credenziali non valide');
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();
  db.prepare('INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES (?, ?, ?)').run(token, admin.id, expiresAt);
  res.json({ token, admin: { username: admin.username, display_name: admin.display_name } });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  deleteAdminSession(authTokenFromRequest(req));
  res.json({ ok: true });
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const currentPassword = `${req.body.currentPassword || ''}`;
  const newPassword = `${req.body.newPassword || ''}`;

  if (!currentPassword || !newPassword) {
    return respondError(res, 400, 'Password attuale e nuova password richieste');
  }

  if (newPassword.length < 6) {
    return respondError(res, 400, 'La nuova password deve avere almeno 6 caratteri');
  }

  const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.admin_id);
  if (!admin || !verifyPassword(currentPassword, admin.password_hash)) {
    return respondError(res, 401, 'La password attuale non è corretta');
  }

  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), admin.id);
  db.prepare('DELETE FROM admin_sessions WHERE admin_id = ? AND token != ?').run(admin.id, authTokenFromRequest(req));

  res.json({ ok: true, message: 'Password aggiornata con successo' });
});

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const date = `${req.query.date || ''}`.trim();
  const bookings = db.prepare(`
    SELECT bookings.*, services.name AS service_name, specialists.name AS specialist_name
    FROM bookings
    JOIN services ON services.id = bookings.service_id
    JOIN specialists ON specialists.id = bookings.specialist_id
    ${date ? 'WHERE bookings.booking_date = ?' : ''}
    ORDER BY bookings.booking_date ASC, bookings.booking_time ASC
  `).all(...(date ? [date] : [])).map(mapBookingRow);

  const specialists = db.prepare('SELECT * FROM specialists ORDER BY name').all().map((specialist) => ({
    ...specialist,
    service_ids: db.prepare('SELECT service_id FROM specialist_services WHERE specialist_id = ? ORDER BY service_id').all(specialist.id).map((row) => row.service_id)
  }));

  res.json({
    settings: getShopSettings(),
    services: db.prepare('SELECT * FROM services ORDER BY sort_order, id').all(),
    specialists,
    bookings
  });
});

app.get('/api/admin/bootstrap', requireAdmin, (req, res) => {
  res.json({
    settings: getShopSettings(),
    services: db.prepare('SELECT * FROM services ORDER BY sort_order, id').all(),
    specialists: db.prepare('SELECT * FROM specialists ORDER BY name').all(),
    bookingsToday: db.prepare(`
      SELECT bookings.*, services.name AS service_name, specialists.name AS specialist_name
      FROM bookings
      JOIN services ON services.id = bookings.service_id
      JOIN specialists ON specialists.id = bookings.specialist_id
      WHERE booking_date = date('now', 'localtime')
      ORDER BY booking_time
    `).all().map(mapBookingRow)
  });
});

app.get('/api/admin/services', requireAdmin, (req, res) => {
  res.json({ services: db.prepare('SELECT * FROM services ORDER BY sort_order, id').all() });
});

app.post('/api/admin/services', requireAdmin, (req, res) => {
  const payload = servicePayload(req.body);
  const missing = requireFields(res, [
    ['name', payload.name],
    ['description', payload.description],
    ['duration_minutes', payload.duration_minutes],
    ['price', payload.price],
    ['image_url', payload.image_url]
  ]);
  if (missing) return missing;
  const result = db.prepare(`
    INSERT INTO services (name, description, duration_minutes, price, image_url, icon, active, featured_home, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(payload.name, payload.description, payload.duration_minutes, payload.price, payload.image_url, payload.icon, payload.active, payload.featured_home, payload.sort_order);
  res.status(201).json({ service: db.prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid) });
});

app.put('/api/admin/services/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const payload = servicePayload(req.body);
  db.prepare(`
    UPDATE services
    SET name = ?, description = ?, duration_minutes = ?, price = ?, image_url = ?, icon = ?, active = ?, featured_home = ?, sort_order = ?
    WHERE id = ?
  `).run(payload.name, payload.description, payload.duration_minutes, payload.price, payload.image_url, payload.icon, payload.active, payload.featured_home, payload.sort_order, id);
  res.json({ service: db.prepare('SELECT * FROM services WHERE id = ?').get(id) });
});

app.delete('/api/admin/services/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM services WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/specialists', requireAdmin, (req, res) => {
  const specialists = db.prepare('SELECT * FROM specialists ORDER BY name').all().map((specialist) => ({
    ...specialist,
    service_ids: db.prepare('SELECT service_id FROM specialist_services WHERE specialist_id = ? ORDER BY service_id').all(specialist.id).map((row) => row.service_id)
  }));
  res.json({ specialists });
});

app.post('/api/admin/specialists', requireAdmin, (req, res) => {
  const payload = specialistPayload(req.body);
  const serviceIds = Array.isArray(req.body.service_ids) ? req.body.service_ids.map(Number).filter(Boolean) : [];
  const missing = requireFields(res, [
    ['name', payload.name],
    ['role', payload.role],
    ['bio', payload.bio],
    ['photo_url', payload.photo_url]
  ]);
  if (missing) return missing;
  const result = db.prepare(`
    INSERT INTO specialists (name, role, bio, photo_url, active)
    VALUES (?, ?, ?, ?, ?)
  `).run(payload.name, payload.role, payload.bio, payload.photo_url, payload.active);
  const specialistId = Number(result.lastInsertRowid);
  const linkStmt = db.prepare('INSERT INTO specialist_services (specialist_id, service_id) VALUES (?, ?)');
  const tx = db.transaction(() => serviceIds.forEach((serviceId) => linkStmt.run(specialistId, serviceId)));
  tx();
  res.status(201).json({ specialist: db.prepare('SELECT * FROM specialists WHERE id = ?').get(specialistId) });
});

app.put('/api/admin/specialists/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const payload = specialistPayload(req.body);
  const serviceIds = Array.isArray(req.body.service_ids) ? req.body.service_ids.map(Number).filter(Boolean) : [];
  db.prepare(`
    UPDATE specialists SET name = ?, role = ?, bio = ?, photo_url = ?, active = ? WHERE id = ?
  `).run(payload.name, payload.role, payload.bio, payload.photo_url, payload.active, id);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM specialist_services WHERE specialist_id = ?').run(id);
    const stmt = db.prepare('INSERT INTO specialist_services (specialist_id, service_id) VALUES (?, ?)');
    serviceIds.forEach((serviceId) => stmt.run(id, serviceId));
  });
  tx();
  res.json({ specialist: db.prepare('SELECT * FROM specialists WHERE id = ?').get(id) });
});

app.delete('/api/admin/specialists/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM specialists WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/availability', requireAdmin, (req, res) => {
  const specialistId = Number(req.query.specialistId);
  if (!specialistId) return respondError(res, 400, 'specialistId richiesto');
  const rules = db.prepare(`
    SELECT * FROM availability_rules WHERE specialist_id = ? ORDER BY weekday, start_time
  `).all(specialistId);
  const exceptions = db.prepare(`
    SELECT * FROM availability_exceptions WHERE specialist_id = ? ORDER BY date_from, start_time
  `).all(specialistId);
  const blocks = db.prepare(`
    SELECT * FROM manual_slot_blocks WHERE specialist_id = ? ORDER BY booking_date, slot_time
  `).all(specialistId);
  res.json({ rules, exceptions, blocks });
});

app.put('/api/admin/availability/:specialistId', requireAdmin, (req, res) => {
  const specialistId = Number(req.params.specialistId);
  const rules = Array.isArray(req.body.rules) ? req.body.rules : [];
  const exceptions = Array.isArray(req.body.exceptions) ? req.body.exceptions : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM availability_rules WHERE specialist_id = ?').run(specialistId);
    db.prepare('DELETE FROM availability_exceptions WHERE specialist_id = ?').run(specialistId);
    const ruleStmt = db.prepare(`
      INSERT INTO availability_rules (specialist_id, weekday, label, start_time, end_time, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    rules.forEach((rule) => {
      if (!rule.active) return;
      if (!rule.start_time || !rule.end_time) return;
      ruleStmt.run(specialistId, Number(rule.weekday), `${rule.label || 'Fascia'}`.trim(), rule.start_time, rule.end_time, 1);
    });
    const exStmt = db.prepare(`
      INSERT INTO availability_exceptions (specialist_id, date_from, date_to, start_time, end_time, scope, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    exceptions.forEach((exception) => {
      if (!exception.date_from || !exception.date_to) return;
      exStmt.run(
        specialistId,
        exception.date_from,
        exception.date_to,
        exception.start_time || null,
        exception.end_time || null,
        `${exception.scope || 'closed_day'}`,
        `${exception.note || ''}`.trim()
      );
    });
  });
  tx();
  res.json({ ok: true });
});

app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const filters = {
    date: `${req.query.date || ''}`.trim(),
    specialistId: Number(req.query.specialistId || 0),
    serviceId: Number(req.query.serviceId || 0),
    status: `${req.query.status || ''}`.trim()
  };
  const where = [];
  const params = [];
  if (filters.date) {
    where.push('bookings.booking_date = ?');
    params.push(filters.date);
  }
  if (filters.specialistId) {
    where.push('bookings.specialist_id = ?');
    params.push(filters.specialistId);
  }
  if (filters.serviceId) {
    where.push('bookings.service_id = ?');
    params.push(filters.serviceId);
  }
  if (filters.status) {
    where.push('bookings.status = ?');
    params.push(filters.status);
  }

  const sql = `
    SELECT bookings.*, services.name AS service_name, specialists.name AS specialist_name
    FROM bookings
    JOIN services ON services.id = bookings.service_id
    JOIN specialists ON specialists.id = bookings.specialist_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY bookings.booking_date ASC, bookings.booking_time ASC
  `;
  res.json({ bookings: db.prepare(sql).all(...params).map(mapBookingRow) });
});

app.post('/api/admin/bookings/block-slot', requireAdmin, (req, res) => {
  const { specialist_id, booking_date, slot_time } = req.body;
  if (!specialist_id || !booking_date || !slot_time) return respondError(res, 400, 'Dati mancanti');
  db.prepare(`
    INSERT INTO manual_slot_blocks (specialist_id, booking_date, slot_time, reason)
    VALUES (?, ?, ?, 'blocked_by_admin')
  `).run(Number(specialist_id), booking_date, slot_time);
  res.json({ ok: true });
});

app.patch('/api/admin/bookings/:id/status', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = `${req.body.status || ''}`.trim();
  if (!['confirmed', 'cancelled', 'pending'].includes(status)) return respondError(res, 400, 'Stato non valido');
  db.prepare('UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
  res.json({ booking: db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) });
});

app.patch('/api/admin/bookings/:id/reschedule', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!booking) return respondError(res, 404, 'Prenotazione non trovata');
  const service = getServiceById(booking.service_id);
  const date = `${req.body.booking_date || ''}`.trim();
  const time = `${req.body.booking_time || ''}`.trim();
  const slots = getAvailableStartSlots(booking.specialist_id, date, service.duration_minutes, booking.id);
  if (!slots.includes(time)) return respondError(res, 409, 'Slot non disponibile');
  db.prepare(`
    UPDATE bookings
    SET booking_date = ?, booking_time = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(date, time, createEndTime(time, service.duration_minutes), id);
  res.json({ booking: db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) });
});

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json({ settings: getShopSettings() });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const payload = {
    shop_name: `${req.body.shop_name || ''}`.trim(),
    tagline: `${req.body.tagline || ''}`.trim(),
    logo_url: `${req.body.logo_url || ''}`.trim(),
    phone: `${req.body.phone || ''}`.trim(),
    email: `${req.body.email || ''}`.trim(),
    address: `${req.body.address || ''}`.trim(),
    city: `${req.body.city || ''}`.trim(),
    opening_note: `${req.body.opening_note || ''}`.trim()
  };
  db.prepare(`
    UPDATE shop_settings
    SET shop_name = ?, tagline = ?, logo_url = ?, phone = ?, email = ?, address = ?, city = ?, opening_note = ?
    WHERE id = 1
  `).run(payload.shop_name, payload.tagline, payload.logo_url, payload.phone, payload.email, payload.address, payload.city, payload.opening_note);
  res.json({ settings: getShopSettings() });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin', 'index.html'));
});

app.get('/admin/services', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin', 'services.html'));
});

app.get('/admin/specialists', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin', 'specialists.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.path === '/admin') return next();
  return res.sendFile(path.join(publicDir, 'client', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`barber-central-booking listening on http://${HOST}:${PORT}`);
});
