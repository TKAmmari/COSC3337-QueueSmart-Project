/* Appointments: students can book and manage advising appointments */
(function () {

  const shell = QS.shell.mount({
    role: 'student',
    title: 'Appointments',
    active: 'appointments.html'
  });

  if (!shell) return;

  const { user, main } = shell;

  // Get the available advising services from the store
  const services = QS.store.getServices();

  // Create the options for the service dropdown
  const serviceOptions = services.map(service =>
    `<option value="${service.id}">${service.name}</option>`
  ).join('');

  main.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2>Book an Appointment</h2>
          <p class="muted">Choose a service, date, and time.</p>
        </div>
      </div>

      <form id="appointmentForm">
        <div class="field">
          <label for="serviceId">Service</label>
          <select id="serviceId" name="serviceId" class="input">
            <option value="">Select a service</option>
            ${serviceOptions}
          </select>
        </div>

        <div class="field">
          <label for="date">Appointment date</label>
          <input type="date" id="date" name="date" class="input">
        </div>

        <div class="field">
          <label for="time">Appointment time</label>
          <select id="time" name="time" class="input">
            <option value="">Select a time</option>
            <option value="09:00">9:00 AM</option>
            <option value="10:00">10:00 AM</option>
            <option value="11:00">11:00 AM</option>
            <option value="13:00">1:00 PM</option>
            <option value="14:00">2:00 PM</option>
            <option value="15:00">3:00 PM</option>
          </select>
        </div>

        <button class="btn btn-primary" type="submit">
          Book appointment
        </button>
      </form>
    </div>

    <div class="panel" style="margin-top: 24px;">
      <div class="panel-head">
        <h2>Upcoming Appointments</h2>
      </div>

      <div id="appointmentList">
        <p class="muted">No upcoming appointments.</p>
      </div>
    </div>

    <!-- Modify Appointment Modal Dialog -->
    <dialog id="modify-apt-dialog" class="dialog">
      <h2>Modify Appointment</h2>
      <p class="muted">Update your scheduled appointment details.</p>
      <div class="field">
        <label for="mod-apt-date">New Date</label>
        <input type="date" id="mod-apt-date" class="input">
      </div>
      <div class="field">
        <label for="mod-apt-time">New Time</label>
        <select id="mod-apt-time" class="input">
          <option value="09:00">9:00 AM</option>
          <option value="10:00">10:00 AM</option>
          <option value="11:00">11:00 AM</option>
          <option value="13:00">1:00 PM</option>
          <option value="14:00">2:00 PM</option>
          <option value="15:00">3:00 PM</option>
        </select>
      </div>
      <div class="actions">
        <button type="button" id="close-modal-btn" class="btn btn-ghost">Cancel</button>
        <button type="button" id="save-modal-btn" class="btn btn-primary">Save Changes</button>
      </div>
    </dialog>
  `;

  const form = document.getElementById('appointmentForm');
  const modal = document.getElementById('modify-apt-dialog');
  let currentModifyingId = null;

  // Render appointments list
  function renderAppointments() {
    const list = document.getElementById('appointmentList');
    const appointments = QS.store.getAppointments(user.id);

    if (!appointments || appointments.length === 0) {
      list.innerHTML = `<p class="muted">No upcoming appointments.</p>`;
      return;
    }

    list.innerHTML = appointments.map(appointment => {
      const service = QS.store.getService(appointment.serviceId);
      const serviceName = service ? service.name : 'Advising Session';
      const date = new Date(appointment.startAt);

      // Status pill styling matching your styles.css
      const isCanceled = appointment.status === 'canceled';
      const statusPill = isCanceled 
        ? `<span class="pill oc-canceled">Canceled</span>` 
        : `<span class="pill st-waiting">Scheduled</span>`;

      // Buttons only show if active
      let actionButtons = '';
      if (!isCanceled) {
        actionButtons = `
          <div class="btn-row" style="margin-top: 14px;">
            <button type="button" class="btn btn-sm btn-ghost btn-modify" data-id="${appointment.id}">Modify</button>
            <button type="button" class="btn btn-sm btn-danger btn-cancel" data-id="${appointment.id}">Cancel</button>
          </div>
        `;
      }

      return `
        <div class="panel" style="margin-top: 12px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: 16px;">${QS.fmt.esc(serviceName)}</h3>
              <p style="margin: 0 0 6px 0;">${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
            </div>
            ${statusPill}
          </div>
          ${actionButtons}
        </div>
      `;
    }).join('');

    // Attach click listeners to Cancel buttons
    list.querySelectorAll('.btn-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to cancel this appointment?')) {
          QS.store.cancelAppointment(id);
          renderAppointments(); // Instant visual update
        }
      });
    });

    // Attach click listeners to Modify buttons
    list.querySelectorAll('.btn-modify').forEach(btn => {
      btn.addEventListener('click', () => {
        currentModifyingId = btn.getAttribute('data-id');
        const apt = appointments.find(a => a.id === currentModifyingId);
        if (apt) {
          const d = new Date(apt.startAt);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const hh = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');

          document.getElementById('mod-apt-date').value = `${yyyy}-${mm}-${dd}`;
          document.getElementById('mod-apt-time').value = `${hh}:${min}`;
          modal.showModal();
        }
      });
    });
  }

  // Modal actions
  document.getElementById('close-modal-btn').addEventListener('click', () => modal.close());
  document.getElementById('save-modal-btn').addEventListener('click', () => {
    const newDate = document.getElementById('mod-apt-date').value;
    const newTime = document.getElementById('mod-apt-time').value;

    if (!newDate || !newTime) {
      alert('Please select both a date and a time.');
      return;
    }

    QS.store.updateAppointment(currentModifyingId, { date: newDate, time: newTime });
    modal.close();
    renderAppointments(); // Instant visual update
  });

  // Re-render automatically whenever state changes
  document.addEventListener('qs:change', () => renderAppointments());

  // Initial render
  renderAppointments();

  // Booking Form Submission
  QS.validate.attach(form, {
    serviceId: [QS.validate.rules.required('Service')],
    date: [QS.validate.rules.required('Appointment date'), QS.validate.rules.notPast('Appointment date')],
    time: [QS.validate.rules.required('Appointment time')]
  }, data => {
    form.reset();
    QS.store.bookAppointment(user.id, data.serviceId, data.date, data.time);
    renderAppointments();
  });

})();