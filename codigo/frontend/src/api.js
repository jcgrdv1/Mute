import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mute_admin_token');
  if (token) {
    config.headers['X-Admin-Token'] = token;
  }
  return config;
});

export const registerUser = (data) => api.post('/register', data);
export const verifyUser = (data) => api.post('/verify', data);
export const verifyPhone = (telefono) => api.post('/verify-phone', { telefono });
export const getUsers = (status) =>
  api.get('/users', { params: status ? { status } : {} });
export const updateUser = (id, data) => api.patch(`/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/users/${id}`);
export const bulkUpdateStatus = (ids, status) =>
  api.post('/users/bulk-status', { ids, status });
export const banOldestActive = (count, skip = 0) =>
  api.post('/users/ban-oldest', { count, skip });
export const getCapacity = () => api.get('/admin/capacity');
export const adminLogin = (password) => api.post('/admin/login', { password });
export const createInvites = (payload) =>
  api.post(
    '/admin/invites',
    typeof payload === 'object' ? payload : { cantidad: payload },
  );
export const getInvites = () => api.get('/admin/invites');
export const deleteInvite = (code) => api.delete(`/admin/invites/${code}`);

export default api;
