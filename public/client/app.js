const state = {
  settings: null,
  services: [],
  specialists: [],
  availability: [],
  selectedService: null,
  selectedSpecialist: null,
  selectedDate: null,
  selectedTime: null,
  bookings: [],
  deviceId: getDeviceId(),
  completed: false,
  customerArea: {
    activeBookingToken: null,
    days: [],
    selectedDate: null,
    selectedTime: null,
    slots: [],
    successMessage: '',
    pendingCancelToken: null
  }
};

const refs = {
  introSplash: document.querySelector('#intro-splash'),
  introLogo: document.querySelector('#intro-logo'),
  introShopName: document.querySelector('#intro-shop-name'),
  shopLogo: document.querySelector('#shop-logo'),
  shopName: document.querySelector('#shop-name'),
  shopTagline: document.querySelector('#shop-tagline'),
  stepViews: [...document.querySelectorAll('.step-view')],
  servicesGrid: document.querySelector('#services-grid'),
  specialistsGrid: document.querySelector('#specialists-grid'),
  daysGrid: document.querySelector('#days-grid'),
  slotsGrid: document.querySelector('#slots-grid'),
  summaryCard: document.querySelector('#summary-card'),
  bookingForm: document.querySelector('#booking-form'),
  bookingPanel: document.querySelector('#booking-panel'),
  successPanel: document.querySelector('#success-panel'),
  successSummary: document.querySelector('#success-summary'),
  resetFlow: document.querySelector('#reset-flow'),
  goToBookings: document.querySelector('#go-to-bookings'),
  myBookingsTrigger: document.querySelector('#my-bookings-trigger'),
  bookingsDialog: document.querySelector('#bookings-dialog'),
  closeBookings: document.querySelector('#close-bookings'),
  bookingsStatus: document.querySelector('#bookings-status'),
  bookingsList: document.querySelector('#bookings-list'),
  bookingsSuccess: document.querySelector('#bookings-success'),
  bookingsSuccessCopy: document.querySelector('#bookings-success-copy'),
  bookingsSuccessClose: document.querySelector('#bookings-success-close'),
  cancelDialog: document.querySelector('#cancel-dialog'),
  cancelConfirmYes: document.querySelector('#cancel-confirm-yes'),
  cancelConfirmNo: document.querySelector('#cancel-confirm-no')
};

const runtimeApiBase = `${window.APP_CONFIG?.API_BASE || ''}`.trim();
let resolvedApiBase = '';
let introDismissed = false;
const LOCAL_LOGO_SRC = '/client/assets/logo-barber.svg';

function isNativeLike() {
  return Boolean(window.Capacitor) || location.protocol === 'capacitor:' || location.protocol === 'file:';
}

async function resolveApiBase() {
  if (resolvedApiBase) return resolvedApiBase;

  const candidates = runtimeApiBase
    ? [runtimeApiBase]
    : isNativeLike()
      ? ['http://localhost:3100', 'http://10.0.2.2:3100', 'http://192.168.1.21:3100']
      : [''];

  for (const base of candidates) {
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.ok) {
        resolvedApiBase = base;
        return resolvedApiBase;
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error('Backend non raggiungibile o risposta non valida');
}

async function api(path, options = {}) {
  const apiBase = await resolveApiBase();
  const response = await fetch(`${apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => null);
  if (data === null) {
    throw new Error('Backend non raggiungibile o risposta non valida');
  }
  if (!response.ok) throw new Error(data.error || 'Richiesta non riuscita');
  return data;
}

function getDeviceId() {
  const key = 'barber-central-device-id';
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    deviceId = `device-${crypto.randomUUID()}`;
    localStorage.setItem(key, deviceId);
  }
  return deviceId;
}

function setStep(step) {
  refs.stepViews.forEach((view) => {
    view.classList.toggle('is-hidden', Number(view.dataset.stepView) !== step);
  });
}

function renderBootstrap() {
  if (!state.settings) return;
  refs.shopLogo.src = state.settings.logo_url || LOCAL_LOGO_SRC;
  refs.shopLogo.onerror = () => {
    refs.shopLogo.onerror = null;
    refs.shopLogo.src = LOCAL_LOGO_SRC;
  };
  refs.shopName.textContent = state.settings.shop_name;
  refs.shopTagline.textContent = state.settings.tagline;
  if (refs.introLogo) {
    refs.introLogo.src = state.settings.logo_url || LOCAL_LOGO_SRC;
    refs.introLogo.onerror = () => {
      refs.introLogo.onerror = null;
      refs.introLogo.src = LOCAL_LOGO_SRC;
    };
  }
  if (refs.introShopName) {
    refs.introShopName.textContent = state.settings.shop_name;
  }
}

function renderServices(error = '') {
  const services = Array.isArray(state.services) ? state.services : [];
  refs.servicesGrid.innerHTML = '';
  if (error) {
    refs.servicesGrid.innerHTML = `<p class="empty-state error-copy">${error}</p>`;
    return;
  }
  if (!services.length) {
    refs.servicesGrid.innerHTML = '<p class="empty-state">Nessun servizio attivo al momento.</p>';
    return;
  }
  services.forEach((service) => {
    const button = document.createElement('button');
    button.className = `service-card${state.selectedService?.id === service.id ? ' is-active' : ''}`;
    button.innerHTML = `
      <span class="service-icon">${renderServiceIcon(service)}</span>
      <h3>${service.name}</h3>
      <p class="service-meta">${service.duration_minutes} min · € ${service.price}</p>
      <p class="muted">${service.description}</p>
    `;
    button.addEventListener('click', async () => {
      state.selectedService = service;
      state.selectedSpecialist = null;
      state.selectedDate = null;
      state.selectedTime = null;
      renderServices();
      await loadSpecialists();
      setStep(2);
    });
    refs.servicesGrid.appendChild(button);
  });
}

function renderServiceIcon(service) {
  const name = `${service.name || ''}`.toLowerCase();
  if (name.includes('taglio + barba')) {
    return `
      <span class="icon-combo icon-combo-double" aria-label="Taglio più barba">
        <span class="icon-glyph">${iconScissors()}</span>
        <span class="icon-plus">+</span>
        <span class="icon-glyph">${iconRazor()}</span>
      </span>
    `;
  }
  if (name.includes('taglio junior')) {
    return `
      <span class="icon-combo">
        <span class="icon-glyph">${iconJunior()}</span>
      </span>
    `;
  }
  if (name.includes('barba') || name.includes('shave')) {
    return `
      <span class="icon-combo">
        <span class="icon-glyph">${iconRazor()}</span>
      </span>
    `;
  }
  return `
    <span class="icon-combo">
      <span class="icon-glyph">${iconScissors()}</span>
    </span>
  `;
}

function iconScissors() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.2 7.2a2.2 2.2 0 1 1-3.1 3.1 2.2 2.2 0 0 1 3.1-3.1Zm0 6.5a2.2 2.2 0 1 1-3.1 3.1 2.2 2.2 0 0 1 3.1-3.1ZM9 9l10-5m-10 11 10 5M8.7 10.2l4.1 3.6m-4.1-.1 4.1-3.6" />
    </svg>
  `;
}

function iconRazor() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 15.5 13.8 5.7a2.6 2.6 0 0 1 3.7 0l1 1a1.8 1.8 0 0 1 0 2.6l-1.8 1.8M4 15.5l4.7 4.5m-4.7-4.5 7.4-1m-2.7 5.5 1-7.3m4.6-6.5 4.8 4.8" />
    </svg>
  `;
}

function iconJunior() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 9.5c.6-2.7 2.8-4.5 5.5-4.5s4.9 1.8 5.5 4.5M8.3 17.5c1.1 1 2.8 1.5 4.7 1.5s3.6-.5 4.7-1.5M10 12h.01M16 12h.01M6.5 18.5c.8-1.9 2.7-3 6.5-3s5.7 1.1 6.5 3" />
    </svg>
  `;
}

function renderSpecialists(error = '') {
  const specialists = Array.isArray(state.specialists) ? state.specialists : [];
  refs.specialistsGrid.innerHTML = '';
  if (error) {
    refs.specialistsGrid.innerHTML = `<p class="empty-state error-copy">${error}</p>`;
    return;
  }
  if (!specialists.length) {
    refs.specialistsGrid.innerHTML = '<p class="empty-state">Nessuno specialista disponibile per questo servizio.</p>';
    return;
  }
  specialists.forEach((specialist) => {
    const button = document.createElement('button');
    button.className = `specialist-card${state.selectedSpecialist?.id === specialist.id ? ' is-active' : ''}`;
    button.innerHTML = `
      <div class="specialist-top">
        <img src="${specialist.photo_url}" alt="${specialist.name}">
        <div>
          <h3>${specialist.name}</h3>
          <p class="specialist-meta">${specialist.role}</p>
        </div>
      </div>
      <p class="muted">${specialist.bio}</p>
    `;
    button.addEventListener('click', async () => {
      state.selectedSpecialist = specialist;
      state.selectedDate = null;
      state.selectedTime = null;
      renderSpecialists();
      await loadAvailability();
      setStep(3);
    });
    refs.specialistsGrid.appendChild(button);
  });
}

function dateCardParts(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const dayLabel = new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(date).replace('.', '');
  const dateLabel = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit' }).format(date);
  return {
    day: dayLabel,
    date: dateLabel
  };
}

function labelDate(dateString) {
  const parts = dateCardParts(dateString);
  return `${parts.day} ${parts.date}`;
}

function renderAvailability(error = '') {
  const availability = Array.isArray(state.availability) ? state.availability : [];
  refs.daysGrid.innerHTML = '';
  refs.slotsGrid.innerHTML = '';
  refs.slotsGrid.classList.add('is-hidden');
  if (error) {
    refs.daysGrid.innerHTML = `<p class="empty-state error-copy">${error}</p>`;
    return;
  }
  if (!availability.length) {
    refs.daysGrid.innerHTML = '<p class="empty-state">Nessuna data disponibile per questo specialista.</p>';
    return;
  }

  availability.forEach((availableDay) => {
    const day = { value: availableDay.date, ...dateCardParts(availableDay.date) };
    const button = document.createElement('button');
    button.className = `day-pill${state.selectedDate === day.value ? ' is-active' : ''}`;
    button.innerHTML = `
      <span class="day-pill-weekday">${day.day}</span>
      <span class="day-pill-date">${day.date}</span>
    `;
    button.addEventListener('click', () => {
      state.selectedDate = day.value;
      state.selectedTime = null;
      renderAvailability();
      renderSummary();
    });
    refs.daysGrid.appendChild(button);
  });

  const selectedDay = availability.find((day) => day.date === state.selectedDate);

  if (!selectedDay) {
    refs.slotsGrid.innerHTML = '<p class="empty-state">Seleziona una data per vedere gli orari disponibili.</p>';
    return;
  }

  refs.slotsGrid.classList.remove('is-hidden');

  (selectedDay?.slots || []).forEach((slot) => {
    const button = document.createElement('button');
    button.className = `slot-pill${state.selectedTime === slot ? ' is-active' : ''}`;
    button.textContent = slot;
    button.addEventListener('click', () => {
      state.selectedTime = slot;
      renderAvailability();
      renderSummary();
      setStep(4);
    });
    refs.slotsGrid.appendChild(button);
  });
}

function renderSummary() {
  if (!state.selectedService || !state.selectedSpecialist || !state.selectedDate || !state.selectedTime) {
    refs.summaryCard.innerHTML = '<p class="empty-state">Completa i passaggi precedenti per vedere il riepilogo.</p>';
    return;
  }
  refs.summaryCard.innerHTML = `
    <div class="summary-list">
      <strong>${state.selectedService.name}</strong>
      <span>Specialista: ${state.selectedSpecialist.name}</span>
      <span>Data: ${labelDate(state.selectedDate)}</span>
      <span>Orario: ${state.selectedTime}</span>
      <span>Durata: ${state.selectedService.duration_minutes} minuti</span>
      <span>Prezzo: € ${state.selectedService.price}</span>
    </div>
  `;
}

function renderBookings() {
  const bookings = Array.isArray(state.bookings) ? state.bookings : [];
  refs.bookingsList.innerHTML = '';
  refs.bookingsStatus.textContent = '';
  refs.bookingsStatus.className = 'form-status';
  if (!bookings.length) {
    refs.bookingsList.innerHTML = `
      <div class="manage-empty">
        <strong>Nessuna prenotazione salvata.</strong>
        <p>Quando confermi un appuntamento da questa app, la prenotazione viene memorizzata sul dispositivo e potrai gestirla qui.</p>
      </div>
    `;
    return;
  }

  refs.bookingsList.innerHTML = bookings.map((booking) => {
    const managing = state.customerArea.activeBookingToken === booking.booking_token;
    return `
      <article class="booking-card manage-booking-card">
        <div class="manage-booking-top">
          <div>
            <span class="eyebrow">Prenotazione salvata</span>
            <h3>${booking.service_name}</h3>
          </div>
          <span class="booking-status ${booking.status}">${booking.status_label}</span>
        </div>
        <div class="summary-card manage-summary">
          <div class="summary-list manage-summary-list">
            <div class="summary-row"><span>Specialista</span><span>${booking.specialist_name}</span></div>
            <div class="summary-row"><span>Data</span><span>${labelDate(booking.booking_date)}</span></div>
            <div class="summary-row"><span>Orario</span><span>${booking.booking_time}</span></div>
          </div>
        </div>
        <div class="action-row manage-actions">
          <button class="ghost-btn" type="button" data-manage-action="manage" data-booking-token="${booking.booking_token}">Gestisci</button>
          <button class="primary-btn" type="button" data-manage-action="cancel" data-booking-token="${booking.booking_token}">Annulla</button>
        </div>
        ${managing ? renderManageEditor(booking) : ''}
      </article>
    `;
  }).join('');

  bindManageBookingEvents();
}

function renderManageEditor(booking) {
  const dateOptions = state.customerArea.days.map((item) => `
    <button type="button" class="day-pill ${state.customerArea.selectedDate === item.value ? 'is-active' : ''}" data-manage-date="${item.value}" data-booking-token="${booking.booking_token}">
      <span class="day-pill-weekday">${item.day}</span>
      <span class="day-pill-date">${item.date}</span>
    </button>
  `).join('');

  const slotButtons = renderManageSlots();

  return `
    <div class="manage-editor">
      <div class="manage-editor-head">
        <span class="eyebrow">Cambio appuntamento</span>
        <h3 class="manage-title">Seleziona nuovo giorno e orario</h3>
      </div>
      <div class="day-grid manage-date-grid">${dateOptions}</div>
      <div class="slots-grid manage-slots-grid">${slotButtons}</div>
      <div class="action-row manage-actions">
        <button class="primary-btn" type="button" data-manage-action="confirm-reschedule" data-booking-token="${booking.booking_token}" ${state.customerArea.selectedTime ? '' : 'disabled'}>
          Conferma
        </button>
      </div>
    </div>
  `;
}

function renderManageSlots() {
  if (!state.customerArea.selectedDate) {
    return '<p class="empty-state manage-helper">Seleziona prima un giorno.</p>';
  }
  if (!state.customerArea.slots.length) {
    return '<p class="empty-state manage-helper">Nessuno slot disponibile in questa data.</p>';
  }
  return state.customerArea.slots.map((slot) => `
    <button type="button" class="slot-pill ${state.customerArea.selectedTime === slot ? ' is-active' : ''}" data-manage-time="${slot}">
      ${slot}
    </button>
  `).join('');
}

function bindManageBookingEvents() {
  refs.bookingsList.querySelectorAll('[data-manage-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.manageAction;
      const token = button.dataset.bookingToken;
      if (action === 'cancel') {
        state.customerArea.pendingCancelToken = token;
        refs.cancelDialog?.showModal();
        return;
      }
      if (action === 'manage') {
        state.customerArea.activeBookingToken = token;
        await loadManageAvailability(token);
        state.customerArea.selectedDate = null;
        state.customerArea.selectedTime = null;
        state.customerArea.slots = [];
        renderBookings();
        return;
      }
      if (action === 'confirm-reschedule') {
        refs.bookingsStatus.textContent = '';
        refs.bookingsStatus.className = 'form-status';
        try {
          await api(`/api/client/bookings/${token}/reschedule`, {
            method: 'PATCH',
            body: JSON.stringify({
              booking_date: state.customerArea.selectedDate,
              booking_time: state.customerArea.selectedTime
            })
          });
          showManageSuccess(`Prenotazione aggiornata. Nuovo appuntamento: ${labelDate(state.customerArea.selectedDate)} alle ${state.customerArea.selectedTime}.`);
          resetManageEditorState();
          await loadBookings();
        } catch (error) {
          refs.bookingsStatus.textContent = error.message;
          refs.bookingsStatus.classList.add('is-error');
        }
      }
    });
  });

  refs.bookingsList.querySelectorAll('[data-manage-date]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.customerArea.activeBookingToken = button.dataset.bookingToken;
      state.customerArea.selectedDate = button.dataset.manageDate;
      state.customerArea.selectedTime = null;
      await loadManageSlots(button.dataset.bookingToken, button.dataset.manageDate);
      renderBookings();
    });
  });

  refs.bookingsList.querySelectorAll('[data-manage-time]').forEach((button) => {
    button.addEventListener('click', () => {
      state.customerArea.selectedTime = button.dataset.manageTime;
      renderBookings();
    });
  });
}

async function loadManageSlots(token, date) {
  const booking = state.bookings.find((item) => item.booking_token === token);
  if (!booking) {
    state.customerArea.slots = [];
    return;
  }
  const params = new URLSearchParams({
    serviceId: String(booking.service_id),
    specialistId: String(booking.specialist_id),
    referenceDate: date
  });
  const data = await api(`/api/client/availability?${params.toString()}`);
  const day = (data.days || []).find((item) => item.date === date);
  state.customerArea.slots = day?.slots || [];
}

async function loadManageAvailability(token) {
  const booking = state.bookings.find((item) => item.booking_token === token);
  if (!booking) {
    state.customerArea.days = [];
    return;
  }
  const params = new URLSearchParams({
    serviceId: String(booking.service_id),
    specialistId: String(booking.specialist_id)
  });
  const data = await api(`/api/client/availability?${params.toString()}`);
  state.customerArea.days = (data.days || []).map((day) => ({
    value: day.date,
    ...dateCardParts(day.date)
  }));
}

async function loadBootstrap() {
  const data = await api('/api/client/bootstrap');
  state.settings = data.settings;
  state.services = Array.isArray(data.services) ? data.services : [];
  renderBootstrap();
  if (!state.services.length) {
    renderServices('Nessun servizio restituito dal backend.');
    return;
  }
  renderServices();
}

async function loadSpecialists() {
  try {
    const data = await api(`/api/client/services/${state.selectedService.id}/specialists`);
    state.specialists = Array.isArray(data.specialists) ? data.specialists : [];
    renderSpecialists();
  } catch (error) {
    renderSpecialists(error.message);
  }
}

async function loadAvailability() {
  try {
    const params = new URLSearchParams({
      serviceId: String(state.selectedService.id),
      specialistId: String(state.selectedSpecialist.id)
    });
    const data = await api(`/api/client/availability?${params.toString()}`);
    state.availability = Array.isArray(data.days) ? data.days : [];
    renderAvailability();
    renderSummary();
  } catch (error) {
    renderAvailability(error.message);
  }
}

async function loadBookings() {
  const data = await api(`/api/client/bookings?deviceId=${encodeURIComponent(state.deviceId)}`);
  state.bookings = (Array.isArray(data.bookings) ? data.bookings : []).filter((booking) => booking.status !== 'cancelled');
  renderBookings();
}

function resetManageEditorState() {
  state.customerArea.activeBookingToken = null;
  state.customerArea.days = [];
  state.customerArea.selectedDate = null;
  state.customerArea.selectedTime = null;
  state.customerArea.slots = [];
  state.customerArea.pendingCancelToken = null;
}

function showManageSuccess(message) {
  state.customerArea.successMessage = message;
  refs.bookingsSuccessCopy.textContent = message;
  refs.bookingsSuccess.classList.remove('is-hidden');
}

async function submitBooking(event) {
  event.preventDefault();
  const formData = new FormData(refs.bookingForm);
  const payload = {
    service_id: state.selectedService.id,
    specialist_id: state.selectedSpecialist.id,
    booking_date: state.selectedDate,
    booking_time: state.selectedTime,
    customer_name: `${formData.get('customer_name') || ''}`.trim(),
    customer_phone: `${formData.get('customer_phone') || ''}`.trim(),
    customer_device_id: state.deviceId
  };
  const { booking } = await api('/api/client/bookings', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  state.completed = true;
  refs.bookingPanel.classList.add('is-hidden');
  refs.successSummary.innerHTML = `
    <div class="summary-list">
      <strong>${booking.service_name}</strong>
      <span>Specialista: ${booking.specialist_name}</span>
      <span>Data: ${labelDate(booking.booking_date)}</span>
      <span>Orario: ${booking.booking_time}</span>
      <span>Durata: ${booking.duration_minutes} minuti</span>
      <span>Prezzo: € ${booking.price}</span>
    </div>
  `;
  refs.successPanel.classList.remove('is-hidden');
  await loadBookings();
}

function resetFlow() {
  state.selectedService = null;
  state.selectedSpecialist = null;
  state.selectedDate = null;
  state.selectedTime = null;
  state.completed = false;
  refs.bookingForm.reset();
  refs.bookingPanel.classList.remove('is-hidden');
  refs.successPanel.classList.add('is-hidden');
  renderServices();
  renderSpecialists();
  renderAvailability();
  renderSummary();
  setStep(1);
}

function bindEvents() {
  document.querySelectorAll('[data-back-step]').forEach((button) => {
    button.addEventListener('click', () => setStep(Number(button.dataset.backStep)));
  });
  refs.bookingForm.addEventListener('submit', submitBooking);
  refs.resetFlow.addEventListener('click', resetFlow);
  refs.goToBookings.addEventListener('click', () => refs.bookingsDialog.showModal());
  refs.myBookingsTrigger.addEventListener('click', async () => {
    await loadBookings();
    refs.bookingsSuccess.classList.add('is-hidden');
    refs.bookingsDialog.showModal();
  });
  refs.closeBookings.addEventListener('click', () => refs.bookingsDialog.close());
  refs.bookingsSuccessClose.addEventListener('click', () => {
    refs.bookingsSuccess.classList.add('is-hidden');
  });
  refs.cancelConfirmNo?.addEventListener('click', () => {
    state.customerArea.pendingCancelToken = null;
    refs.cancelDialog?.close();
  });
  refs.cancelConfirmYes?.addEventListener('click', async () => {
    const token = state.customerArea.pendingCancelToken;
    if (!token) {
      refs.cancelDialog?.close();
      return;
    }
    refs.bookingsStatus.textContent = '';
    refs.bookingsStatus.className = 'form-status';
    try {
      await api(`/api/client/bookings/${token}/cancel`, { method: 'PATCH' });
      refs.cancelDialog?.close();
      showManageSuccess('Prenotazione annullata correttamente.');
      resetManageEditorState();
      await loadBookings();
    } catch (error) {
      refs.cancelDialog?.close();
      refs.bookingsStatus.textContent = error.message;
      refs.bookingsStatus.classList.add('is-error');
    }
  });
}

function startIntroSplash() {
  if (!refs.introSplash) return;
  window.setTimeout(hideIntroSplash, 1900);
}

function hideIntroSplash() {
  if (introDismissed || !refs.introSplash) return;
  introDismissed = true;
  refs.introSplash.classList.add('is-leaving');
  window.setTimeout(() => {
    refs.introSplash.classList.add('is-hidden');
  }, 520);
}

(async function init() {
  startIntroSplash();
  bindEvents();
  renderSummary();
  try {
    await loadBootstrap();
  } catch (error) {
    renderServices(error.message);
  }
})();
