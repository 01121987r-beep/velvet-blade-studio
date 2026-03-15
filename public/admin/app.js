import { clearToken, initChangePassword, logoutToLogin, request, storageKey } from '/admin/shared.js';

const dom = {
  loginPanel: document.querySelector('[data-login-panel]'),
  dashboardPanel: document.querySelector('[data-dashboard-panel]'),
  loginForm: document.querySelector('[data-admin-login]'),
  loginError: document.querySelector('[data-login-error]'),
  bookingFilter: document.querySelector('[data-booking-filter]'),
  bookingStatusFilter: document.querySelector('[data-booking-status-filter]'),
  bookingDateFilter: document.querySelector('[data-booking-date-filter]'),
  bookingRows: document.querySelector('[data-booking-rows]'),
  specialistSelect: document.querySelector('[data-specialist-select]'),
  availabilityEditor: document.querySelector('[data-availability-editor]'),
  exceptionForm: document.querySelector('[data-exception-form]'),
  exceptionList: document.querySelector('[data-exception-list]'),
  availabilitySave: document.querySelector('[data-save-availability]'),
  availabilityStatus: document.querySelector('[data-availability-status]'),
  logout: document.querySelector('[data-logout]')
};

const weekdays = [
  { value: 1, label: 'Lunedi' },
  { value: 2, label: 'Martedi' },
  { value: 3, label: 'Mercoledi' },
  { value: 4, label: 'Giovedi' },
  { value: 5, label: 'Venerdi' },
  { value: 6, label: 'Sabato' }
];

let token = localStorage.getItem(storageKey);
let specialists = [];
let services = [];
let bookings = [];
let availabilityPayload = { rules: [], exceptions: [] };

function setStatus(element, message = '', mode = '') {
  if (!element) return;
  element.textContent = message;
  element.classList.remove('is-success', 'is-error');
  if (mode) element.classList.add(mode === 'success' ? 'is-success' : 'is-error');
}

function getBookingStatusLabel(status) {
  return { confirmed: 'Confermata', pending: 'In attesa', cancelled: 'Annullata' }[status] || status;
}

function formatDisplayDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year.slice(-2)}`;
}

function getTodayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function expandDateRange(startDate, endDate) {
  if (!startDate) return [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate || startDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const result = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function groupBookingsByFilters() {
  const specialistFilter = dom.bookingFilter?.value || 'all';
  const statusFilter = dom.bookingStatusFilter?.value || 'all';
  return bookings.filter((booking) => {
    const matchesSpecialist = specialistFilter === 'all' ? true : String(booking.specialist_id) === specialistFilter;
    const matchesStatus = statusFilter === 'all' ? true : booking.status === statusFilter;
    return matchesSpecialist && matchesStatus;
  });
}

function renderBookingRows() {
  const rows = groupBookingsByFilters();
  if (!rows.length) {
    dom.bookingRows.innerHTML = '<tr><td colspan="8">Nessuna prenotazione per il filtro selezionato.</td></tr>';
    return;
  }

  dom.bookingRows.innerHTML = rows.map((booking) => `
    <tr class="${booking.status === 'cancelled' ? 'booking-row-cancelled' : ''}">
      <td>${booking.customer_name}</td>
      <td>${booking.customer_phone}</td>
      <td>${booking.service_name}</td>
      <td>${booking.specialist_name}</td>
      <td>${formatDisplayDate(booking.booking_date)}</td>
      <td>${booking.booking_time}</td>
      <td>${getBookingStatusLabel(booking.status)}</td>
      <td>
        <select data-booking-status="${booking.id}">
          <option value="confirmed" ${booking.status === 'confirmed' ? 'selected' : ''}>Confermata</option>
          <option value="pending" ${booking.status === 'pending' ? 'selected' : ''}>In attesa</option>
          <option value="cancelled" ${booking.status === 'cancelled' ? 'selected' : ''}>Annullata</option>
        </select>
      </td>
    </tr>
  `).join('');

  dom.bookingRows.querySelectorAll('[data-booking-status]').forEach((select) => {
    select.addEventListener('change', async () => {
      await request(`/api/admin/bookings/${select.dataset.bookingStatus}/status`, {
        method: 'PATCH',
        body: { status: select.value }
      });
      await loadBookings();
    });
  });
}

function buildRangeMarkup(rule = {}) {
  return `
    <div class="time-range" data-range>
      <label>
        <span>Fascia oraria</span>
        <input type="text" data-range-label value="${rule.label || 'Fascia'}" />
      </label>
      <label>
        <span>Inizio</span>
        <input type="time" data-range-start value="${rule.start_time || ''}" />
      </label>
      <label>
        <span>Fine</span>
        <input type="time" data-range-end value="${rule.end_time || ''}" />
      </label>
    </div>
  `;
}

function renderAvailabilityEditor() {
  const grouped = weekdays.map((day) => {
    const rules = availabilityPayload.rules.filter((rule) => Number(rule.weekday) === day.value);
    return {
      ...day,
      active: rules.length > 0,
      ranges: rules.length ? rules : [{ label: 'Fascia mattina', start_time: '', end_time: '' }, { label: 'Fascia pomeriggio', start_time: '', end_time: '' }]
    };
  });

  dom.availabilityEditor.innerHTML = grouped.map((day) => `
    <article class="availability-day" data-day-row="${day.label}">
      <div class="availability-day-head">
        <label class="availability-day-toggle">
          <input type="checkbox" data-day-enabled ${day.active ? 'checked' : ''} />
          <span class="availability-day-name">${day.label}</span>
        </label>
      </div>
      <div class="inline-fields">
        ${day.ranges.map((range) => buildRangeMarkup(range)).join('')}
      </div>
    </article>
  `).join('');

  renderExceptionList();
}

function renderExceptionList() {
  if (!availabilityPayload.exceptions.length) {
    dom.exceptionList.innerHTML = '<li>Nessuna esclusione configurata.</li>';
    return;
  }

  dom.exceptionList.innerHTML = availabilityPayload.exceptions.map((exception, index) => `
    <li>
      <strong>${formatDisplayDate(exception.date_from)}${exception.date_to !== exception.date_from ? ` → ${formatDisplayDate(exception.date_to)}` : ''}</strong>
      <span>${exception.start_time && exception.end_time ? `${exception.start_time} - ${exception.end_time}` : 'Giorno chiuso'}</span>
      <button class="icon-btn" type="button" data-delete-exception="${index}">Rimuovi</button>
    </li>
  `).join('');

  dom.exceptionList.querySelectorAll('[data-delete-exception]').forEach((button) => {
    button.addEventListener('click', () => {
      availabilityPayload.exceptions.splice(Number(button.dataset.deleteException), 1);
      renderExceptionList();
    });
  });
}

function collectAvailabilityPayload() {
  const rules = [];
  dom.availabilityEditor.querySelectorAll('[data-day-row]').forEach((row, index) => {
    const weekday = weekdays[index].value;
    if (!row.querySelector('[data-day-enabled]')?.checked) return;
    row.querySelectorAll('[data-range]').forEach((range) => {
      const label = range.querySelector('[data-range-label]')?.value?.trim() || 'Fascia';
      const start = range.querySelector('[data-range-start]')?.value;
      const end = range.querySelector('[data-range-end]')?.value;
      if (!start || !end) return;
      rules.push({ weekday, label, start_time: start, end_time: end, active: true });
    });
  });
  return { rules, exceptions: availabilityPayload.exceptions };
}

async function loadDashboard() {
  const data = await request(`/api/admin/dashboard?date=${encodeURIComponent(dom.bookingDateFilter.value)}`);
  specialists = data.specialists;
  services = data.services;
  bookings = data.bookings;

  dom.bookingFilter.innerHTML = '<option value="all">Tutti</option>' + specialists.map((specialist) => `<option value="${specialist.id}">${specialist.name}</option>`).join('');
  dom.specialistSelect.innerHTML = specialists.map((specialist) => `<option value="${specialist.id}">${specialist.name}</option>`).join('');
  renderBookingRows();
  await loadAvailability();
}

async function loadBookings() {
  const date = dom.bookingDateFilter.value || getTodayISO();
  const data = await request(`/api/admin/bookings?date=${encodeURIComponent(date)}`);
  bookings = data.bookings;
  renderBookingRows();
}

async function loadAvailability() {
  const specialistId = Number(dom.specialistSelect.value || 0);
  if (!specialistId) return;
  const data = await request(`/api/admin/availability?specialistId=${specialistId}`);
  availabilityPayload = { rules: data.rules || [], exceptions: data.exceptions || [] };
  renderAvailabilityEditor();
}

function showDashboard() {
  dom.loginPanel.classList.add('is-hidden');
  dom.dashboardPanel.classList.remove('is-hidden');
  dom.dashboardPanel.hidden = false;
}

function showLogin() {
  dom.loginPanel.classList.remove('is-hidden');
  dom.dashboardPanel.classList.add('is-hidden');
  dom.dashboardPanel.hidden = true;
}

function bindEvents() {
  dom.logout?.addEventListener('click', logoutToLogin);
  initChangePassword();
  dom.bookingFilter?.addEventListener('change', renderBookingRows);
  dom.bookingStatusFilter?.addEventListener('change', renderBookingRows);
  dom.bookingDateFilter?.addEventListener('change', loadBookings);
  dom.specialistSelect?.addEventListener('change', loadAvailability);

  dom.loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(dom.loginError, '');
    try {
      const formData = new FormData(dom.loginForm);
      const data = await request('/api/admin/login', {
        method: 'POST',
        body: {
          username: `${formData.get('username') || ''}`.trim(),
          password: `${formData.get('password') || ''}`
        }
      }, false);
      token = data.token;
      localStorage.setItem(storageKey, token);
      showDashboard();
      dom.bookingDateFilter.value = getTodayISO();
      await loadDashboard();
    } catch (error) {
      setStatus(dom.loginError, error.message, 'error');
    }
  });

  dom.exceptionForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(dom.exceptionForm);
    const startDate = `${formData.get('exceptionStartDate') || ''}`;
    const endDate = `${formData.get('exceptionEndDate') || startDate}`;
    const startTime = `${formData.get('exceptionStart') || ''}`;
    const endTime = `${formData.get('exceptionEnd') || ''}`;
    const days = expandDateRange(startDate, endDate);
    if (!days.length) {
      setStatus(dom.availabilityStatus, 'Seleziona almeno una data valida.', 'error');
      return;
    }
    days.forEach((date) => {
      availabilityPayload.exceptions.push({
        date_from: date,
        date_to: date,
        start_time: startTime || null,
        end_time: endTime || null,
        scope: startTime && endTime ? 'partial_block' : 'closed_day',
        note: ''
      });
    });
    ['exceptionStartDate', 'exceptionEndDate', 'exceptionStart', 'exceptionEnd'].forEach((name) => {
      const field = dom.exceptionForm.elements[name];
      if (field) field.value = '';
    });
    renderExceptionList();
    setStatus(dom.availabilityStatus, 'Esclusione aggiunta. Ricordati di salvare.', 'success');
  });

  dom.availabilitySave?.addEventListener('click', async () => {
    try {
      const specialistId = Number(dom.specialistSelect.value || 0);
      await request(`/api/admin/availability/${specialistId}`, {
        method: 'PUT',
        body: collectAvailabilityPayload()
      });
      setStatus(dom.availabilityStatus, 'Disponibilità salvata con successo.', 'success');
      await loadAvailability();
    } catch (error) {
      setStatus(dom.availabilityStatus, error.message, 'error');
    }
  });
}

bindEvents();

(async function init() {
  dom.bookingDateFilter.value = getTodayISO();
  if (!token) return showLogin();
  try {
    showDashboard();
    await loadDashboard();
  } catch {
    clearToken();
    token = null;
    showLogin();
  }
})();
