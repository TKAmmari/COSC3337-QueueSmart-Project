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
          <select id="serviceId" name="serviceId">
            <option value="">Select a service</option>
            ${serviceOptions}
          </select>
        </div>

        <div class="field">
          <label for="date">Appointment date</label>
          <input type="date" id="date" name="date">
        </div>

        <div class="field">
          <label for="time">Appointment time</label>
          <select id="time" name="time">
            <option value="">Select a time</option>
            <option value="09:00">9:00 AM</option>
            <option value="10:00">10:00 AM</option>
            <option value="11:00">11:00 AM</option>
            <option value="13:00">1:00 PM</option>
            <option value="14:00">2:00 PM</option>
            <option value="15:00">3:00 PM</option>
          </select>
        </div>

        <button class="btn primary" type="submit">
          Book appointment
        </button>

      </form>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>Upcoming Appointments</h2>
      </div>

      <div id="appointmentList">
        <p class="muted">No upcoming appointments.</p>
      </div>
    </div>
  `;

  const form = document.getElementById('appointmentForm');

  function renderAppointments() {
  const list = document.getElementById('appointmentList');
  const appointments = QS.store.getAppointments(user.id);

  if (appointments.length === 0) {
    list.innerHTML = `<p class="muted">No upcoming appointments.</p>`;
    return;
  }

  list.innerHTML = appointments.map(appointment => {
    const service = QS.store.getService(appointment.serviceId);
    const date = new Date(appointment.startAt);

    return `
      <div class="card">
        <h3>${service.name}</h3>
        <p>${date.toLocaleDateString()} at ${date.toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit'
        })}</p>
        <p class="muted">Status: ${appointment.status}</p>
      </div>
    `;
  }).join('');
}

renderAppointments();

  QS.validate.attach(form, {
    serviceId: [
      QS.validate.rules.required('Service')
    ],

    date: [
      QS.validate.rules.required('Appointment date'),
      QS.validate.rules.notPast('Appointment date')
    ],

    time: [
      QS.validate.rules.required('Appointment time')
    ]
  }, data => {

    form.reset();

  QS.store.bookAppointment(
    user.id,
    data.serviceId,
    data.date,
    data.time
  );

  QS.toast('Appointment booked successfully.');

  form.reset();
});
})();