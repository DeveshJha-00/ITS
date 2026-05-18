import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to admin requests
export const setAdminToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = token;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

// Public endpoints
export const getSlots = (filters = {}) => {
  return api.get('/slots', { params: filters });
};

export const createBooking = (data) => {
  return api.post('/bookings', data);
};

export const cancelBooking = (bookingId) => {
  return api.delete(`/bookings/${bookingId}`);
};

export const checkIn = (qrPayload, entryPoint = 'A') => {
  return api.post('/checkin', { qr_payload: qrPayload, entry_point: entryPoint });
};

export const checkOut = (qrPayload) => {
  return api.post('/checkout', { qr_payload: qrPayload });
};

export const completeCheckout = (qrPayload, checkoutTime, exitPoint = 'A') => {
  return api.post('/checkout/complete', {
    qr_payload: qrPayload,
    checkout_time: checkoutTime,
    exit_point: exitPoint,
  });
};

// Layout management (admin)
export const getSlotLayout = () => api.get('/admin/slots/layout');
export const updateSlotLayout = (slots) => api.patch('/admin/slots/layout', { slots });

export const createWalkinBooking = (data) => {
  return api.post('/bookings/walkin', data);
};

export const getPrediction = () => {
  return api.get('/predict/today');
};

// Admin endpoints
export const adminLogin = (password) => {
  return api.post('/admin/login', { password });
};

export const getAnalytics = (period = 'weekly') => {
  return api.get('/admin/analytics', { params: { period } });
};

export const getBookings = (params) => {
  return api.get('/admin/bookings', { params });
};

export const forceAssignBooking = (data) => {
  return api.post('/admin/bookings/force-assign', data);
};

export const deleteBooking = (bookingId) => {
  return api.delete(`/admin/bookings/${bookingId}`);
};

export const pruneBookings = (keepLatest = 5000) => {
  return api.post('/admin/bookings/prune', { keep_latest: keepLatest });
};

export const updateSlot = (slotId, data) => {
  return api.patch(`/admin/slots/${slotId}`, data);
};

export const forceReleaseSlot = (slotId) => {
  return api.post(`/admin/slots/${slotId}/force-release`);
};

export const getSessions = (params) => {
  return api.get('/admin/sessions', { params });
};

export const getUtilizationHeatmap = (days = 7) => {
  return api.get('/admin/utilization-heatmap', { params: { days } });
};

export const getRates = () => {
  return api.get('/admin/rates');
};

export const updateRate = (vehicleType, data) => {
  return api.patch(`/admin/rates/${vehicleType}`, data);
};

export default api;
