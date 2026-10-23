// Numbers for the advisor dashboard (from A1): waiting now, served today,
// average and longest wait, and no-show rate.
const { data } = require('../data/store');

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getStats() {
  // Only count sessions that ended today (the server can stay up for days).
  const today = data.servedLog.filter((s) => s.at >= startOfToday());
  const completed = today.filter((s) => s.outcome === 'completed');
  const noShows = today.filter((s) => s.outcome === 'no-show');
  const waits = completed.map((s) => s.wait);
  const total = (list) => list.reduce((sum, n) => sum + n, 0);

  const serviceDemand = (data.services || []).map((svc) => {
    const queueLength = (data.queues[svc.id] || []).length;
    const servedForService = completed.filter((s) => s.serviceId === svc.id);
    const serviceWaits = servedForService.map((s) => s.wait);
    const avgServiceWait = serviceWaits.length ? Math.round(total(serviceWaits) / serviceWaits.length) : 0;

    return {
      serviceId: svc.id,
      serviceName: svc.name,
      waiting: queueLength,
      servedToday: servedForService.length,
      avgWait: avgServiceWait
    };
  });

  const appointments = data.appointments || [];
  const canceledAppointments = appointments.filter((a) => a.status === 'canceled').length;
  const scheduledAppointments = appointments.filter((a) => a.status === 'scheduled').length;
  const appointmentCancelRate = appointments.length
    ? Math.round((canceledAppointments / appointments.length) * 100)
    : 0;

  return {
    waiting: total(Object.values(data.queues || {}).map((q) => q.length)),
    served: completed.length,
    avgWait: waits.length ? Math.round(total(waits) / waits.length) : 0,
    maxWait: waits.length ? Math.max(...waits) : 0,
    noShowRate: today.length ? Math.round((noShows.length / today.length) * 100) : 0,
    serviceDemand,
    appointmentStats: {
      total: appointments.length,
      scheduled: scheduledAppointments,
      canceled: canceledAppointments,
      cancelRate: appointmentCancelRate
    }
  };
}

module.exports = { getStats };