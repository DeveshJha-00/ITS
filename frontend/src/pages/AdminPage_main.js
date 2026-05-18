import React, { useEffect, useState } from 'react';
import {
  adminLogin,
  getAnalytics,
  getSlots,
  getBookings,
  forceAssignBooking,
  deleteBooking,
  pruneBookings,
  setAdminToken,
  getRates,
  updateRate,
  getSlotLayout,
} from '../api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import SlotGrid from '../components/SlotGrid';
import ChartSection from '../components/ChartSection';
import { LogOut, X, Plus, Trash2, RefreshCcw } from 'lucide-react';

const getLocalDatetimeValue = (date = new Date()) => {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().slice(0, 16);
};

const createBookingDraft = (slot = null) => ({
  slot_id: slot?.slot_id || '',
  driver_name: '',
  vehicle_number: '',
  vehicle_type: slot?.category || '4W',
  arrival_time: getLocalDatetimeValue(),
  status: 'confirmed',
  checkin_time: '',
  checkout_time: '',
  amount_charged: '',
});

const formatSalesLabel = (value, period) => {
  if (!value) return '';

  if (period === 'yearly') {
    return new Date(`${value}-01`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

function AdminPage() {
  const LOG_PAGE_LIMIT = 200;
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [rateForm, setRateForm] = useState({});
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [selectedTab, setSelectedTab] = useState('dashboard');
  const [salesPeriod, setSalesPeriod] = useState('weekly');
  const [bookingDraft, setBookingDraft] = useState(createBookingDraft());
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchAnalytics = async (period = salesPeriod) => {
    try {
      const response = await getAnalytics(period);
      setAnalytics(response.data);
      setError('');
    } catch (err) {
      setError('Failed to fetch analytics');
    }
  };

  const fetchSlots = async () => {
    try {
      const response = await getSlots();
      setSlots(response.data);
      setError('');
    } catch (err) {
      setError('Failed to fetch slots');
    }
  };

  const fetchBookings = async () => {
    setLogsLoading(true);
    try {
      const response = await getBookings({ limit: LOG_PAGE_LIMIT, offset: 0 });
      setBookings(response.data || []);
      setError('');
    } catch (err) {
      setError('Failed to fetch bookings');
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchRates = async () => {
    try {
      const response = await getRates();
      const initialForm = {};
      response.data.forEach((item) => {
        initialForm[item.vehicle_type] = {
          min_charge: item.min_charge,
          hourly_rate: item.hourly_rate,
        };
      });
      setRateForm(initialForm);
      setError('');
    } catch (err) {
      setError('Failed to fetch rates');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await adminLogin(password);
      setAdminToken(response.data.token);
      setIsAuthenticated(true);
      setPassword('');
      setError('');
      await fetchAnalytics(salesPeriod);
      await fetchRates();
    } catch (err) {
      setError('Invalid password');
    } finally {
      setLoading(false);
    }
  };

  const handleRateChange = (vehicleType, field, value) => {
    setRateForm((prev) => ({
      ...prev,
      [vehicleType]: {
        ...prev[vehicleType],
        [field]: value,
      },
    }));
  };

  const saveRate = async (vehicleType) => {
    try {
      const payload = rateForm[vehicleType];
      await updateRate(vehicleType, {
        min_charge: Number(payload.min_charge),
        hourly_rate: Number(payload.hourly_rate),
      });
      await fetchRates();
      setMessage(`${vehicleType} pricing updated.`);
      setError('');
    } catch (err) {
      setError('Failed to update rate');
    }
  };

  const handleSlotSelect = async (slot) => {
    setError('');
    // start with a fresh draft for the selected slot so all fields update
    setBookingDraft(createBookingDraft(slot));

    // if slot is already booked/occupied, fetch its existing booking and prefill fields for edit
    if (slot.status !== 'available') {
      try {
        const resp = await getBookings({ slot_id: slot.slot_id });
        const activeStatuses = new Set(['checked_in', 'reserved', 'confirmed']);
        const rows = Array.isArray(resp.data) ? resp.data : [];
        const existing = rows.find((item) => activeStatuses.has(item.status)) || null;
        if (existing) {
          setBookingDraft({
            slot_id: existing.slot_id,
            driver_name: existing.driver_name || '',
            vehicle_number: existing.vehicle_number || '',
            vehicle_type: existing.vehicle_type || slot.category || '4W',
            arrival_time: existing.arrival_time ? existing.arrival_time.slice(0,16) : getLocalDatetimeValue(),
            status: existing.status || 'confirmed',
            checkin_time: existing.checkin_time ? existing.checkin_time.slice(0,16) : '',
            checkout_time: existing.checkout_time ? existing.checkout_time.slice(0,16) : '',
            amount_charged: existing.amount_charged != null ? existing.amount_charged : '',
          });

          setMessage(`Loaded current booking for ${slot.slot_id}. Edit and Save to replace.`);
          return;
        }

        setMessage(`Selected ${slot.slot_id}. No active booking details found, so the form is blank.`);
        return;
      } catch (err) {
        // fall back to basic selection
        setError('Failed to load existing booking details');
      }
    }

    setMessage(`Selected ${slot.slot_id}. The occupied slot will be replaced on save.`);
  };

  const handleForceAssign = async (e) => {
    e.preventDefault();
    try {
      await forceAssignBooking({
        slot_id: bookingDraft.slot_id,
        driver_name: bookingDraft.driver_name,
        vehicle_number: bookingDraft.vehicle_number,
        vehicle_type: bookingDraft.vehicle_type,
        arrival_time: bookingDraft.arrival_time,
        status: bookingDraft.status,
        checkin_time: bookingDraft.checkin_time || null,
        checkout_time: bookingDraft.checkout_time || null,
        amount_charged: bookingDraft.amount_charged === '' ? null : Number(bookingDraft.amount_charged),
      });

      setMessage(`Booking saved for ${bookingDraft.slot_id}.`);
      setError('');
      setBookingDraft(createBookingDraft());
      await fetchAnalytics(salesPeriod);
      await fetchSlots();
      await fetchBookings();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save booking');
    }
  };

  const handleDeleteBooking = async (bookingId) => {
    const confirmed = window.confirm('Delete this booking or log entry?');
    if (!confirmed) return;

    try {
      await deleteBooking(bookingId);
      setMessage('Booking deleted.');
      setError('');
      await fetchAnalytics(salesPeriod);
      await fetchSlots();
      await fetchBookings();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete booking');
    }
  };

  const handlePruneLogs = async () => {
    const confirmed = window.confirm('Delete older completed logs and keep only the latest 5000 entries?');
    if (!confirmed) return;

    try {
      const response = await pruneBookings(5000);
      setMessage(`Deleted ${response.data?.deleted ?? 0} old completed log entries.`);
      setError('');
      await fetchBookings();
      await fetchAnalytics(salesPeriod);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to trim old logs');
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    const loadDashboardData = async () => {
      try {
        const analyticsResponse = await getAnalytics(salesPeriod);
        setAnalytics(analyticsResponse.data);
        const ratesResponse = await getRates();

        const initialForm = {};
        ratesResponse.data.forEach((item) => {
          initialForm[item.vehicle_type] = {
            min_charge: item.min_charge,
            hourly_rate: item.hourly_rate,
          };
        });
        setRateForm(initialForm);
        setError('');
      } catch (err) {
        setError('Failed to fetch dashboard data');
      }
    };

    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, salesPeriod]);

  useEffect(() => {
    if (isAuthenticated && selectedTab === 'slots') {
      fetchSlots();
    }
  }, [isAuthenticated, selectedTab]);

  useEffect(() => {
    if (isAuthenticated && selectedTab === 'logs') {
      fetchBookings();
    }
  }, [isAuthenticated, selectedTab]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[--bg-base] flex items-center justify-center p-4">
        <div className="bg-[--bg-surface] border border-[--border] rounded-2xl p-8 max-w-md w-full shadow-2xl">
          <h1 className="text-4xl font-display font-bold text-[--text-primary] mb-2 text-center">ParkSmart</h1>
          <p className="text-[--text-muted] text-center mb-8 text-sm">Admin Dashboard</p>

          <form onSubmit={handleLogin}>
            <div className="mb-6">
              <label className="block text-xs uppercase tracking-widest text-[--text-muted] mb-2">
                Admin Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[--bg-elevated] border border-[--border] rounded-lg px-4 py-3 text-[--text-primary] focus:ring-2 focus:ring-[--accent-blue] outline-none transition"
                placeholder="Enter admin password"
                autoComplete="off"
              />
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg mb-4 text-sm flex justify-between items-center">
                <span>{error}</span>
                <button type="button" onClick={() => setError('')}>
                  <X size={16} />
                </button>
              </div>
            )}
            <button type="submit" disabled={loading} className="w-full btn-primary font-semibold py-3 disabled:opacity-50 flex items-center justify-center">
              {loading ? 'Authenticating...' : 'Login'}
            </button>
          </form>
          <p className="text-center text-[--text-muted] text-xs mt-6">
            Demo password: <code className="bg-[--bg-elevated] px-2 py-1 rounded">admin123</code>
          </p>
        </div>
      </div>
    );
  }

  const TabButton = ({ id, label }) => (
    <button
      onClick={() => setSelectedTab(id)}
      className={`px-6 py-3 font-medium text-sm uppercase tracking-wider transition-all duration-200 border-b-2 flex items-center justify-center whitespace-nowrap ${
        selectedTab === id
          ? 'border-[--accent-blue] text-[--accent-blue]'
          : 'border-transparent text-[--text-muted] hover:text-[--text-primary]'
      }`}
    >
      {label}
    </button>
  );

  const salesSeries = analytics?.sales_summary?.series || analytics?.sales_series || [];
  const salesLabelKey = salesPeriod === 'yearly' ? 'month' : 'day';
  const occupancySeries = analytics?.occupancy_series || [];
  const occupancyLabelKey = salesPeriod === 'yearly' ? 'month' : 'day';
  const hourlyVehicleFlow = analytics?.hourly_vehicle_flow || [];

  return (
    <div className="min-h-screen">
      <div className="bg-[--bg-surface] border-b border-[--border] sticky top-16 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-display font-bold text-[--text-primary]">Command Center</h1>
            <p className="text-xs text-[--text-muted] uppercase tracking-widest mt-1">Admin control panel</p>
          </div>
          <button
            onClick={() => {
              setIsAuthenticated(false);
              setAdminToken(null);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[--bg-elevated] hover:bg-red-500/10 text-[--text-muted] hover:text-red-400 rounded-lg transition"
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>

        <div className="border-t border-[--border] flex gap-8 px-6 overflow-x-auto">
          <TabButton id="dashboard" label="Dashboard" />
          <TabButton id="slots" label="Slot Management" />
          <TabButton id="logs" label="Logs" />
          <TabButton id="rates" label="Billing" />
          <TabButton id="layout" label="Layout" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {message && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-6 py-4 rounded-lg flex justify-between items-center">
            <span className="font-medium">{message}</span>
            <button onClick={() => setMessage('')}>
              <X size={20} />
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-6 py-4 rounded-lg flex justify-between items-center">
            <span className="font-medium">{error}</span>
            <button onClick={() => setError('')}>
              <X size={20} />
            </button>
          </div>
        )}

        {selectedTab === 'dashboard' && analytics && (
          <div className="space-y-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-3xl font-display font-bold text-[--text-primary]">Live Metrics</h2>
                <p className="text-[--text-muted] text-sm mt-1">Switch between weekly, monthly, and yearly sales and occupancy views.</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {['weekly', 'monthly', 'yearly'].map((period) => (
                  <button
                    key={period}
                    onClick={() => setSalesPeriod(period)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
                      salesPeriod === period
                        ? 'bg-[--accent-blue] text-white border-[--accent-blue]'
                        : 'bg-[--bg-surface] border-[--border] text-[--text-muted] hover:text-[--text-primary]'
                    }`}
                  >
                    {period.charAt(0).toUpperCase() + period.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard title="Occupancy Rate" value={`${analytics.occupancy_rate}%`} trend="current occupancy" />
              <StatCard title={`${salesPeriod.charAt(0).toUpperCase() + salesPeriod.slice(1)} Sales`} value={`₹${analytics.sales_summary?.total_revenue ?? 0}`} trend="revenue" />
              <StatCard title={`${salesPeriod.charAt(0).toUpperCase() + salesPeriod.slice(1)} Sessions`} value={analytics.sales_summary?.total_sessions ?? 0} trend="transactions" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartSection title={`${salesPeriod.charAt(0).toUpperCase() + salesPeriod.slice(1)} Sales Trend`}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey={salesLabelKey}
                      stroke="var(--text-muted)"
                      tickFormatter={(value) => formatSalesLabel(value, salesPeriod)}
                    />
                    <YAxis stroke="var(--text-muted)" />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                      labelStyle={{ color: 'var(--text-primary)' }}
                      labelFormatter={(value) => formatSalesLabel(value, salesPeriod)}
                    />
                    <Bar dataKey="revenue" fill="var(--accent-blue)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartSection>

              <ChartSection title="Hourly Vehicle Flow">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={hourlyVehicleFlow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="hour" stroke="var(--text-muted)" />
                    <YAxis stroke="var(--text-muted)" />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                      labelStyle={{ color: 'var(--text-primary)' }}
                      formatter={(value, name) => [value, name === 'entries' ? 'Entries' : 'Exits']}
                    />
                    <Bar dataKey="entries" fill="var(--accent-blue)" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="exits" fill="var(--accent-amber)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartSection>

              <ChartSection title={`${salesPeriod.charAt(0).toUpperCase() + salesPeriod.slice(1)} Occupancy Trend`}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={occupancySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey={occupancyLabelKey}
                      stroke="var(--text-muted)"
                      tickFormatter={(value) => formatSalesLabel(value, salesPeriod)}
                    />
                    <YAxis
                      stroke="var(--text-muted)"
                      tickFormatter={(value) => `${Math.round(Number(value) || 0)}%`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                      labelStyle={{ color: 'var(--text-primary)' }}
                      labelFormatter={(value) => formatSalesLabel(value, salesPeriod)}
                      formatter={(value) => [`${Math.round(Number(value) || 0)}%`, 'Occupancy']}
                    />
                    <Bar dataKey="occupancy_pct" fill="var(--accent-amber)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartSection>
            </div>

            <ChartSection title="Vehicle Type Distribution">
              <div className="space-y-4">
                {analytics.vehicle_type_breakdown.map((item) => {
                  const percentage = Math.round((item.count / (analytics.today_sessions || 1)) * 100);
                  return (
                    <div key={item.vehicle_type}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">{item.vehicle_type}</span>
                        <span className="text-sm text-[--text-muted]">{item.count} sessions</span>
                      </div>
                      <div className="w-full h-2 bg-[--bg-elevated] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[--accent-blue] to-[--accent-green]"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ChartSection>
          </div>
        )}

        {selectedTab === 'slots' && (
          <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-3xl font-display font-bold text-[--text-primary]">Slot Management</h2>
                <p className="text-[--text-muted] text-sm mt-1">Click any slot, including occupied ones, to replace its booking.</p>
              </div>
              <button
                type="button"
                onClick={fetchSlots}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[--border] bg-[--bg-surface] text-[--text-muted] hover:text-[--text-primary]"
              >
                <RefreshCcw size={16} />
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] gap-6">
              <div className="bg-[--bg-surface] border border-[--border] rounded-xl p-4 sm:p-6">
                <SlotGrid slots={slots} loading={false} onSlotClick={handleSlotSelect} nearestSlotId={bookingDraft.slot_id} adminMode />
              </div>

              <div className="bg-[--bg-surface] border border-[--border] rounded-xl p-6 space-y-4 sticky top-28 self-start">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xl font-display font-bold text-[--text-primary]">Force Assign Booking</h3>
                  <Plus size={18} className="text-[--accent-blue]" />
                </div>
                <p className="text-sm text-[--text-muted]">This replaces whatever is currently attached to the selected seat.</p>

                <form className="space-y-4" onSubmit={handleForceAssign}>
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-[--text-muted] mb-2">Slot ID</label>
                    <input
                      type="text"
                      value={bookingDraft.slot_id}
                      onChange={(e) => setBookingDraft((prev) => ({ ...prev, slot_id: e.target.value.toUpperCase() }))}
                      className="w-full bg-[--bg-elevated] border border-[--border] rounded-lg px-4 py-2.5 text-[--text-primary] focus:ring-2 focus:ring-[--accent-blue] outline-none"
                      placeholder="Select a slot"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-[--text-muted] mb-2">Driver Name</label>
                    <input
                      type="text"
                      value={bookingDraft.driver_name}
                      onChange={(e) => setBookingDraft((prev) => ({ ...prev, driver_name: e.target.value }))}
                      className="w-full bg-[--bg-elevated] border border-[--border] rounded-lg px-4 py-2.5 text-[--text-primary] focus:ring-2 focus:ring-[--accent-blue] outline-none"
                      placeholder="Driver name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-[--text-muted] mb-2">Vehicle Number</label>
                    <input
                      type="text"
                      value={bookingDraft.vehicle_number}
                      onChange={(e) => setBookingDraft((prev) => ({ ...prev, vehicle_number: e.target.value.toUpperCase() }))}
                      className="w-full bg-[--bg-elevated] border border-[--border] rounded-lg px-4 py-2.5 text-[--text-primary] focus:ring-2 focus:ring-[--accent-blue] outline-none"
                      placeholder="e.g. DL01AB1234"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-[--text-muted] mb-2">Vehicle Type</label>
                      <select
                        value={bookingDraft.vehicle_type}
                        onChange={(e) => setBookingDraft((prev) => ({ ...prev, vehicle_type: e.target.value }))}
                        className="w-full bg-[--bg-elevated] border border-[--border] rounded-lg px-4 py-2.5 text-[--text-primary] focus:ring-2 focus:ring-[--accent-blue] outline-none"
                      >
                        {['2W', '4W', 'EV', 'Disabled'].map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-[--text-muted] mb-2">Status</label>
                      <select
                        value={bookingDraft.status}
                        onChange={(e) => setBookingDraft((prev) => ({ ...prev, status: e.target.value }))}
                        className="w-full bg-[--bg-elevated] border border-[--border] rounded-lg px-4 py-2.5 text-[--text-primary] focus:ring-2 focus:ring-[--accent-blue] outline-none"
                      >
                        <option value="confirmed">Confirmed</option>
                        <option value="checked_in">Checked In</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-[--text-muted] mb-2">Arrival Time</label>
                    <input
                      type="datetime-local"
                      value={bookingDraft.arrival_time}
                      onChange={(e) => setBookingDraft((prev) => ({ ...prev, arrival_time: e.target.value }))}
                      className="w-full bg-[--bg-elevated] border border-[--border] rounded-lg px-4 py-2.5 text-[--text-primary] focus:ring-2 focus:ring-[--accent-blue] outline-none"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-[--text-muted] mb-2">Check-in Time</label>
                      <input
                        type="datetime-local"
                        value={bookingDraft.checkin_time}
                        onChange={(e) => setBookingDraft((prev) => ({ ...prev, checkin_time: e.target.value }))}
                        className="w-full bg-[--bg-elevated] border border-[--border] rounded-lg px-4 py-2.5 text-[--text-primary] focus:ring-2 focus:ring-[--accent-blue] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-[--text-muted] mb-2">Check-out Time</label>
                      <input
                        type="datetime-local"
                        value={bookingDraft.checkout_time}
                        onChange={(e) => setBookingDraft((prev) => ({ ...prev, checkout_time: e.target.value }))}
                        className="w-full bg-[--bg-elevated] border border-[--border] rounded-lg px-4 py-2.5 text-[--text-primary] focus:ring-2 focus:ring-[--accent-blue] outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-[--text-muted] mb-2">Amount Charged</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={bookingDraft.amount_charged}
                      onChange={(e) => setBookingDraft((prev) => ({ ...prev, amount_charged: e.target.value }))}
                      className="w-full bg-[--bg-elevated] border border-[--border] rounded-lg px-4 py-2.5 text-[--text-primary] focus:ring-2 focus:ring-[--accent-blue] outline-none"
                      placeholder="Optional for historical logs"
                    />
                  </div>

                  <button type="submit" className="w-full btn-primary font-semibold py-3 flex items-center justify-center gap-2">
                    <Plus size={16} />
                    Save or Replace
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'logs' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-3xl font-display font-bold text-[--text-primary]">Logs</h2>
                <p className="text-[--text-muted] text-sm mt-1">Showing latest {LOG_PAGE_LIMIT} entries. Older completed entries can be trimmed.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePruneLogs}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 hover:text-red-200"
                >
                  <Trash2 size={16} />
                  Trim Old Logs
                </button>
                <button
                  type="button"
                  onClick={fetchBookings}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[--border] bg-[--bg-surface] text-[--text-muted] hover:text-[--text-primary]"
                >
                  <RefreshCcw size={16} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="bg-[--bg-surface] border border-[--border] rounded-xl overflow-hidden">
              {logsLoading && (
                <div className="px-4 py-6 text-[--text-muted] text-sm border-b border-[--border]">
                  Loading booking logs...
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[--bg-elevated] border-b border-[--border]">
                      <th className="px-4 py-3 text-left text-[--text-muted] uppercase tracking-widest font-semibold">Booking ID</th>
                      <th className="px-4 py-3 text-left text-[--text-muted] uppercase tracking-widest font-semibold">Slot</th>
                      <th className="px-4 py-3 text-left text-[--text-muted] uppercase tracking-widest font-semibold">Driver</th>
                      <th className="px-4 py-3 text-left text-[--text-muted] uppercase tracking-widest font-semibold">Vehicle</th>
                      <th className="px-4 py-3 text-left text-[--text-muted] uppercase tracking-widest font-semibold">Status</th>
                      <th className="px-4 py-3 text-left text-[--text-muted] uppercase tracking-widest font-semibold">Check-in</th>
                      <th className="px-4 py-3 text-left text-[--text-muted] uppercase tracking-widest font-semibold">Check-out</th>
                      <th className="px-4 py-3 text-right text-[--text-muted] uppercase tracking-widest font-semibold">Amount</th>
                      <th className="px-4 py-3 text-right text-[--text-muted] uppercase tracking-widest font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!logsLoading && bookings.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="px-4 py-10 text-center text-[--text-muted]">
                          No records yet.
                        </td>
                      </tr>
                    ) : (
                      bookings.map((booking, index) => (
                        <tr
                          key={booking.booking_id}
                          className={`border-b border-[--border] transition hover:bg-[--bg-elevated] ${index % 2 === 0 ? 'bg-[--bg-base]' : 'bg-[--bg-surface]'}`}
                        >
                          <td className="px-4 py-3 font-mono text-xs text-[--accent-blue]">{booking.booking_id.slice(0, 8)}</td>
                          <td className="px-4 py-3 font-semibold">{booking.slot_id}</td>
                          <td className="px-4 py-3">{booking.driver_name}</td>
                          <td className="px-4 py-3 font-mono text-xs">{booking.vehicle_number}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-1 rounded-full bg-[--bg-elevated] text-[--text-primary] text-xs uppercase tracking-widest">
                              {booking.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[--text-muted] text-xs">
                            {booking.checkin_time ? new Date(booking.checkin_time).toLocaleString() : '-'}
                          </td>
                          <td className="px-4 py-3 text-[--text-muted] text-xs">
                            {booking.checkout_time ? new Date(booking.checkout_time).toLocaleString() : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-[--accent-green]">
                            {booking.amount_charged != null ? `₹${booking.amount_charged}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeleteBooking(booking.booking_id)}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 size={16} />
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'layout' && (
          <LayoutManager />
        )}

        {selectedTab === 'rates' && (
          <div className="space-y-6">
            <h2 className="text-3xl font-display font-bold text-[--text-primary]">Billing Configuration</h2>
            <div className="bg-[--bg-surface] border border-[--border] rounded-xl p-6">
              <p className="text-[--text-muted] text-sm mb-8">
                Set minimum charges and hourly rates. The final bill is the greater of min charge or (rate × duration).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {['2W', '4W', 'EV'].map((vehicleType) => (
                  <div key={vehicleType} className="bg-[--bg-elevated] border border-[--border] rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-[--text-primary] mb-4 font-display">{vehicleType}</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-[--text-muted] mb-2">
                          Minimum Charge (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={rateForm[vehicleType]?.min_charge ?? ''}
                          onChange={(e) => handleRateChange(vehicleType, 'min_charge', e.target.value)}
                          className="w-full bg-[--bg-surface] border border-[--border] rounded-lg px-3 py-2 text-[--text-primary] focus:ring-2 focus:ring-[--accent-blue] outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-[--text-muted] mb-2">
                          Hourly Rate (₹/hr)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={rateForm[vehicleType]?.hourly_rate ?? ''}
                          onChange={(e) => handleRateChange(vehicleType, 'hourly_rate', e.target.value)}
                          className="w-full bg-[--bg-surface] border border-[--border] rounded-lg px-3 py-2 text-[--text-primary] focus:ring-2 focus:ring-[--accent-blue] outline-none"
                        />
                      </div>
                      <button type="button" onClick={() => saveRate(vehicleType)} className="w-full btn-primary font-semibold py-3 text-sm flex items-center justify-center">
                        Save {vehicleType}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── LayoutManager ─────────────────────────────────────────────────────── */
const LM_CELL = 36;   // px per grid cell
const LM_PAD  = 16;   // px padding
const LM_COLS = 10;
const LM_ROWS = 11;

// Gates are corner cells *inside* the grid — same model as the driver mini-map:
//   Entry A → (x=0,       y=0)           top-left
//   Entry B → (x=LM_COLS-1, y=0)         top-right
//   Exit  A → (x=0,       y=LM_ROWS-1)   bottom-left
//   Exit  B → (x=LM_COLS-1, y=LM_ROWS-1) bottom-right
const ENTRY_GATE_COLOR = { A: 'var(--accent-green)', B: 'var(--accent-blue)' };
const EXIT_GATE_COLOR  = { A: 'var(--accent-amber)', B: '#a78bfa' };

function LayoutManager() {
  const [layoutData, setLayoutData] = useState(null);
  const [loadErr, setLoadErr]       = useState('');

  useEffect(() => {
    getSlotLayout()
      .then(res => setLayoutData(res.data))
      .catch(() => setLoadErr('Failed to load layout data.'));
  }, []);

  if (loadErr) return <p className="text-red-400 p-4">{loadErr}</p>;
  if (!layoutData) return <p className="text-[--text-muted] p-4">Loading layout…</p>;

  const { slots, entry_points, exit_points } = layoutData;

  // Build a quick lookup: "col,row" → slot
  const slotMap = {};
  slots.forEach(s => {
    if (s.pos_x != null && s.pos_y != null) slotMap[`${s.pos_x},${s.pos_y}`] = s;
  });

  // Build gate lookup: "col,row" → { label, color }
  const gateMap = {};
  Object.entries(entry_points).forEach(([key, g]) => {
    gateMap[`${g.x},${g.y}`] = { label: g.name, color: ENTRY_GATE_COLOR[key] || 'var(--accent-green)' };
  });
  Object.entries(exit_points).forEach(([key, g]) => {
    gateMap[`${g.x},${g.y}`] = { label: g.name, color: EXIT_GATE_COLOR[key] || 'var(--accent-amber)' };
  });

  const statusColor = (status) => {
    switch (status) {
      case 'available':   return 'var(--accent-green)';
      case 'reserved':    return 'var(--accent-blue)';
      case 'occupied':    return 'var(--accent-amber)';
      case 'unavailable': return 'var(--text-muted)';
      default:            return 'var(--border)';
    }
  };

  // SVG dimensions — no extra rows; gates overlay the corner grid cells
  const totalW = LM_COLS * LM_CELL + LM_PAD * 2;
  const totalH = LM_ROWS * LM_CELL + LM_PAD * 2;

  const colX = (c) => LM_PAD + c * LM_CELL;
  const rowY = (r) => LM_PAD + r * LM_CELL;
  const midX = (c) => colX(c) + LM_CELL / 2;
  const midY = (r) => rowY(r) + LM_CELL / 2;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-display font-bold text-[--text-primary] mb-1">Parking Layout</h2>
        <p className="text-sm text-[--text-muted]">Gate corners are overlaid on their grid cells. Entry gates (top), Exit gates (bottom).</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs font-medium">
        {[
          { label: 'Available',   color: 'var(--accent-green)' },
          { label: 'Reserved',    color: 'var(--accent-blue)' },
          { label: 'Occupied',    color: 'var(--accent-amber)' },
          { label: 'Unavailable', color: 'var(--text-muted)' },
        ].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-2">
            <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-2 ml-4">
          <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--accent-green)', border: '2px solid var(--text-primary)', display: 'inline-block' }} />
          Entry Gate
        </span>
        <span className="flex items-center gap-2">
          <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--accent-amber)', border: '2px solid var(--text-primary)', display: 'inline-block' }} />
          Exit Gate
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg width={totalW} height={totalH}
          style={{ background: 'var(--bg-elevated)', borderRadius: 16, display: 'block' }}>

          {/* ── Slot grid ── */}
          {Array.from({ length: LM_ROWS }).map((_, r) =>
            Array.from({ length: LM_COLS }).map((_, c) => {
              const slot    = slotMap[`${c},${r}`];
              const gate    = gateMap[`${c},${r}`];
              const fill    = slot ? statusColor(slot.status) : 'var(--bg-surface)';
              const opacity = slot ? 0.75 : 0.35;
              const gx = colX(c);
              const gy = rowY(r);
              return (
                <g key={`cell-${r}-${c}`}>
                  {/* Base slot cell */}
                  <rect x={gx + 1} y={gy + 1} width={LM_CELL - 2} height={LM_CELL - 2}
                    rx={4} fill={fill} opacity={opacity} />
                  {/* Slot number (hidden when a gate overlays this cell) */}
                  {slot && !gate && (
                    <text x={midX(c)} y={midY(r)}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={7} fill="var(--bg-base)" fontFamily="monospace" fontWeight="600">
                      {slot.slot_id.split('-')[1] || ''}
                    </text>
                  )}
                  {/* Gate corner overlay */}
                  {gate && (
                    <>
                      <rect x={gx + 2} y={gy + 2} width={LM_CELL - 4} height={LM_CELL - 4}
                        rx={6} fill={gate.color} opacity={0.9}
                        stroke={gate.color} strokeWidth={1.5} />
                      <text x={midX(c)} y={midY(r)}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={8} fontWeight="bold" fill="#000" fontFamily="monospace">
                        {gate.label}
                      </text>
                    </>
                  )}
                </g>
              );
            })
          )}
        </svg>
      </div>

      {/* Slot list summary */}
      <p className="text-xs text-[--text-muted]">
        {slots.length} total slots · {slots.filter(s => s.status === 'available').length} available ·{' '}
        {slots.filter(s => s.status === 'occupied').length} occupied ·{' '}
        {slots.filter(s => s.status === 'reserved').length} reserved
      </p>
    </div>
  );
}

const StatCard = ({ title, value, trend }) => (
  <div className="bg-[--bg-surface] border border-[--border] rounded-xl p-6 border-l-4 border-l-[--accent-blue]">
    <h3 className="text-sm uppercase tracking-widest text-[--text-muted] mb-2">{title}</h3>
    <div className="flex items-baseline justify-between gap-4">
      <div className="text-4xl font-display font-bold text-[--text-primary] break-words">{value}</div>
      <div className="text-xs font-medium text-[--accent-green] uppercase tracking-widest">{trend}</div>
    </div>
  </div>
);

export default AdminPage;
