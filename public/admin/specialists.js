import { ensureAuthenticated, initChangePassword, logoutToLogin, request } from '/admin/shared.js';

if (ensureAuthenticated()) {
  initChangePassword();
  const form = document.querySelector('[data-specialist-form]');
  const table = document.querySelector('[data-specialists-table]');
  const servicesChecklist = document.querySelector('[data-services-checklist]');
  document.querySelector('[data-logout]')?.addEventListener('click', logoutToLogin);
  document.querySelector('[data-reset-specialist]')?.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    form.elements.active.checked = true;
    [...servicesChecklist.querySelectorAll('input')].forEach((input) => { input.checked = false; });
  });
  form.addEventListener('submit', saveSpecialist);
  loadPage();

  async function loadPage() {
    const dashboard = await request('/api/admin/dashboard');
    servicesChecklist.innerHTML = dashboard.services.map((service) => `
      <label class="inline-checkbox"><input type="checkbox" value="${service.id}" /> <span>${service.name}</span></label>
    `).join('');

    table.innerHTML = dashboard.specialists.map((specialist) => {
      const linkedServices = specialist.service_ids
        .map((serviceId) => dashboard.services.find((item) => item.id === serviceId)?.name)
        .filter(Boolean)
        .join(', ');
      return `
        <tr>
          <td><strong>${specialist.name}</strong><br><small>${specialist.bio}</small></td>
          <td>${specialist.role}</td>
          <td>${linkedServices || 'Nessuno'}</td>
          <td>${specialist.active ? 'Attivo' : 'Pausa'}</td>
          <td class="table-actions">
            <button class="icon-btn" type="button" data-edit-specialist="${specialist.id}">Modifica</button>
            <button class="icon-btn danger" type="button" data-delete-specialist="${specialist.id}">Elimina</button>
          </td>
        </tr>
      `;
    }).join('');

    table.querySelectorAll('[data-edit-specialist]').forEach((button) => {
      button.addEventListener('click', () => {
        const specialist = dashboard.specialists.find((item) => item.id === Number(button.dataset.editSpecialist));
        form.elements.id.value = specialist.id;
        form.elements.name.value = specialist.name;
        form.elements.role.value = specialist.role;
        form.elements.photo_url.value = specialist.photo_url;
        form.elements.bio.value = specialist.bio;
        form.elements.active.checked = Boolean(specialist.active);
        [...servicesChecklist.querySelectorAll('input')].forEach((input) => {
          input.checked = specialist.service_ids.includes(Number(input.value));
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    table.querySelectorAll('[data-delete-specialist]').forEach((button) => {
      button.addEventListener('click', async () => {
        await request(`/api/admin/specialists/${button.dataset.deleteSpecialist}`, { method: 'DELETE' });
        await loadPage();
      });
    });
  }

  async function saveSpecialist(event) {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: `${formData.get('name') || ''}`.trim(),
      role: `${formData.get('role') || ''}`.trim(),
      photo_url: `${formData.get('photo_url') || ''}`.trim(),
      bio: `${formData.get('bio') || ''}`.trim(),
      active: form.elements.active.checked,
      service_ids: [...servicesChecklist.querySelectorAll('input:checked')].map((input) => Number(input.value))
    };
    const id = formData.get('id');
    if (id) {
      await request(`/api/admin/specialists/${id}`, { method: 'PUT', body: payload });
    } else {
      await request('/api/admin/specialists', { method: 'POST', body: payload });
    }
    form.reset();
    form.elements.id.value = '';
    form.elements.active.checked = true;
    [...servicesChecklist.querySelectorAll('input')].forEach((input) => { input.checked = false; });
    await loadPage();
  }
}
