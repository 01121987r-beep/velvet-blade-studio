import { ensureAuthenticated, initChangePassword, logoutToLogin, request } from '/admin/shared.js';

if (ensureAuthenticated()) {
  initChangePassword();
  const form = document.querySelector('[data-service-form]');
  const table = document.querySelector('[data-services-table]');
  document.querySelector('[data-logout]')?.addEventListener('click', logoutToLogin);
  document.querySelector('[data-reset-service]')?.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    form.elements.active.checked = true;
    form.elements.featured_home.checked = true;
  });
  form.addEventListener('submit', saveService);
  loadServices();

  async function loadServices() {
    const dashboard = await request('/api/admin/dashboard');
    table.innerHTML = dashboard.services.map((service) => `
      <tr>
        <td><strong>${service.name}</strong><br><small>${service.description}</small></td>
        <td>€ ${Number(service.price).toFixed(0)}</td>
        <td>${service.duration_minutes} min</td>
        <td>${service.active ? 'Attivo' : 'Pausa'}</td>
        <td class="table-actions">
          <button class="icon-btn" type="button" data-edit-service="${service.id}">Modifica</button>
          <button class="icon-btn danger" type="button" data-delete-service="${service.id}">Elimina</button>
        </td>
      </tr>
    `).join('');

    table.querySelectorAll('[data-edit-service]').forEach((button) => {
      button.addEventListener('click', () => {
        const service = dashboard.services.find((item) => item.id === Number(button.dataset.editService));
        form.elements.id.value = service.id;
        form.elements.name.value = service.name;
        form.elements.price.value = service.price;
        form.elements.duration_minutes.value = service.duration_minutes;
        form.elements.description.value = service.description;
        form.elements.icon.value = service.icon;
        form.elements.sort_order.value = service.sort_order;
        form.elements.image_url.value = service.image_url;
        form.elements.featured_home.checked = Boolean(service.featured_home);
        form.elements.active.checked = Boolean(service.active);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    table.querySelectorAll('[data-delete-service]').forEach((button) => {
      button.addEventListener('click', async () => {
        await request(`/api/admin/services/${button.dataset.deleteService}`, { method: 'DELETE' });
        await loadServices();
      });
    });
  }

  async function saveService(event) {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: `${formData.get('name') || ''}`.trim(),
      price: Number(formData.get('price')),
      duration_minutes: Number(formData.get('duration_minutes')),
      description: `${formData.get('description') || ''}`.trim(),
      icon: `${formData.get('icon') || ''}`.trim(),
      sort_order: Number(formData.get('sort_order')),
      image_url: `${formData.get('image_url') || ''}`.trim(),
      featured_home: form.elements.featured_home.checked,
      active: form.elements.active.checked
    };
    const id = formData.get('id');
    if (id) {
      await request(`/api/admin/services/${id}`, { method: 'PUT', body: payload });
    } else {
      await request('/api/admin/services', { method: 'POST', body: payload });
    }
    form.reset();
    form.elements.id.value = '';
    form.elements.active.checked = true;
    form.elements.featured_home.checked = true;
    await loadServices();
  }
}
