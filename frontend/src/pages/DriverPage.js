import React, { useState, useEffect } from 'react';
import { getSlots, checkIn, checkOut, completeCheckout } from '../api/client';
import SlotGrid from '../components/SlotGrid';
import BookingModal from '../components/BookingModal';
import Toast from '../components/Toast';
import { X } from 'lucide-react';

function DriverPage() {
  const [slots, setSlots] = useState([]);
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('');
  const [availableOnlyFilter, setAvailableOnlyFilter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingResult, setBookingResult] = useState(null);
  const [gateQrPayload, setGateQrPayload] = useState('');
  const [gateMessage, setGateMessage] = useState(null);
  const [checkoutBill, setCheckoutBill] = useState(null);
  const [entryPoint, setEntryPoint] = useState('A');          // 'A' | 'B'
  const [exitPoint, setExitPoint] = useState('A');            // 'A' | 'B'
  const [directions, setDirections] = useState(null);         // check-in nav directions
  const [exitDirections, setExitDirections] = useState(null); // post-checkout nav directions
  const [error, setError] = useState('');

  // Fetch slots
  useEffect(() => {
    const fetchSlots = async () => {
      try {
        const filters = {};
        if (vehicleTypeFilter) filters.type = vehicleTypeFilter;
        if (availableOnlyFilter) filters.status = 'available';
        
        const response = await getSlots(filters);
        setSlots(response.data);
        setError('');
      } catch (err) {
        setError('Failed to fetch slots');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSlots();
    const interval = setInterval(fetchSlots, 5000);
    return () => clearInterval(interval);
  }, [vehicleTypeFilter, availableOnlyFilter]);

  // Fetch prediction

  const handleSlotClick = (slot) => {
    if (slot.status === 'available') {
      setSelectedSlot(slot);
      setError('');
    }
  };

  const handleBookingSuccess = (data) => {
    // data may contain { booking: {...}, qr_payload }
    const bookingObj = data.booking ? { ...data.booking, qr_payload: data.qr_payload } : data;
    setBookingResult(bookingObj);
    setSelectedSlot(null);
    setGateQrPayload(bookingObj.qr_payload || '');
    setGateMessage({
      type: 'info',
      title: 'Reservation created',
      message: 'Proceed to the gate for check-in.',
    });
    setError('');
  }

  const handleCheckIn = async (e) => {
    e.preventDefault();

    if (!gateQrPayload.trim()) {
      setError('Enter the QR payload from your reservation to check in.');
      return;
    }

    try {
      const response = await checkIn(gateQrPayload.trim(), entryPoint);
      setDirections(response.data.directions || null);
      setExitDirections(null); // clear any previous exit nav
      setGateMessage({
        type: 'success',
        title: 'Check-in completed',
        message: `Slot ${response.data.slot_id} is now occupied. Welcome!`,
      });
      setError('');
    } catch (err) {
      setDirections(null);
      setError(err.response?.data?.error || 'Check-in failed');
    }
  };

  const handlePreviewBill = async (e) => {
    e.preventDefault();

    if (!gateQrPayload.trim()) {
      setError('Enter the QR payload from your reservation to generate the bill.');
      return;
    }

    try {
      const response = await checkOut(gateQrPayload.trim());
      setCheckoutBill(response.data.bill);
      setGateMessage({
        type: 'info',
        title: 'Bill generated',
        message: 'Review the bill below and simulate payment when ready.',
      });
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate bill');
    }
  };

  const handleCompletePayment = async () => {
    if (!gateQrPayload.trim() || !checkoutBill) {
      setError('Generate the bill first before completing payment.');
      return;
    }

    try {
      const response = await completeCheckout(gateQrPayload.trim(), checkoutBill.checkout_time, exitPoint);
      setExitDirections(response.data.exit_directions || null);
      setDirections(null); // replace check-in nav with exit nav
      setGateMessage({
        type: 'success',
        title: 'Payment completed',
        message: `Slot ${response.data.bill.slot_id} is now free. Safe travels!`,
      });
      setBookingResult(null);
      setCheckoutBill(null);
      setGateQrPayload('');
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Payment simulation failed');
    }
  };

  const FilterButton = ({ value, current, onClick, children }) => (
    <button
      onClick={() => onClick(value)}
      className={`px-4 py-2.5 rounded-full text-sm font-semibold transition-colors duration-200 flex items-center justify-center whitespace-nowrap border ${
        current === value
          ? 'bg-[--accent-blue] text-white border-[--accent-blue]'
          : 'bg-[--bg-surface] hover:bg-[--bg-elevated] text-[--text-muted] border-[--border]'
      }`}
    >
      {children}
    </button>
  );

  const handleUseQr = async (payload) => {
    if (!payload?.trim()) return setError('Missing booking payload');

    try {
      const response = await checkIn(payload.trim(), entryPoint);
      setDirections(response.data.directions || null);
      setExitDirections(null);
      setGateMessage({
        type: 'success',
        title: 'Check-in completed',
        message: `Slot ${response.data.slot_id} is now occupied. Welcome!`,
      });
      setBookingResult(null);
      setGateQrPayload(payload.trim());
      setError('');
    } catch (err) {
      setDirections(null);
      setError(err.response?.data?.error || 'Check-in failed');
    }
  };

  const handleCopyPayload = async (payload) => {
    if (!payload) return setError('Missing booking payload');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(payload);
        setGateMessage({ type: 'info', title: 'Copied', message: 'QR payload copied to clipboard.' });
      } else {
        // fallback to selecting and copying via execCommand
        setGateQrPayload(payload);
        setGateMessage({ type: 'info', title: 'Payload ready', message: 'QR payload placed in the gate input.' });
      }
      setGateQrPayload(payload || '');
      setError('');
    } catch (err) {
      setGateQrPayload(payload || '');
      setGateMessage({ type: 'info', title: 'Payload ready', message: 'QR payload placed in the gate input.' });
    }
  };

  const handleDownload = (payload) => {
    if (!payload) return setError('Missing booking payload');
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(payload)}`;
    // open in new tab for user to download
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-display font-bold text-[--text-primary] mb-2">Driver View</h1>
        <p className="text-[--text-muted] mb-8">Live parking availability and instant booking.</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-4 flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')}><X size={18} /></button>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Slot Map */}
          <div className="lg:col-span-2">
            <div className="bg-[--bg-surface] border border-[--border] rounded-xl p-6 mb-8">
              <h2 className="text-xl font-bold mb-4">Filters</h2>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <FilterButton value="" current={vehicleTypeFilter} onClick={setVehicleTypeFilter}>All</FilterButton>
                  <FilterButton value="2W" current={vehicleTypeFilter} onClick={setVehicleTypeFilter}>2-Wheeler</FilterButton>
                  <FilterButton value="4W" current={vehicleTypeFilter} onClick={setVehicleTypeFilter}>4-Wheeler</FilterButton>
                  <FilterButton value="EV" current={vehicleTypeFilter} onClick={setVehicleTypeFilter}>EV</FilterButton>
                  <FilterButton value="Disabled" current={vehicleTypeFilter} onClick={setVehicleTypeFilter}>Disabled</FilterButton>
                </div>
                <div className="flex-grow" />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={availableOnlyFilter}
                    onChange={(e) => setAvailableOnlyFilter(e.target.checked)}
                    className="w-4 h-4 rounded accent-[--accent-blue]"
                  />
                  <span className="text-sm text-[--text-muted] font-medium">Available Only</span>
                </label>
              </div>
            </div>

            <SlotGrid
              slots={slots}
              loading={loading}
              onSlotClick={handleSlotClick}
              nearestSlotId={slots.find(s => s.status === 'available')?.slot_id}
            />
          </div>

          {/* Right Column: Booking/Check-in + Navigation */}
          <div className="lg:col-span-1 overflow-y-auto max-h-screen">
            {bookingResult ? (
              <>
                <QRCodeScreen
                  booking={bookingResult}
                  entryPoint={entryPoint}
                  setEntryPoint={setEntryPoint}
                  onDownload={handleDownload}
                  onUseQr={handleUseQr}
                  onCopyPayload={handleCopyPayload}
                />
                {directions && directions.pos_x !== null && (
                  <NavigationPanel
                    title={`Navigate to ${directions.slot_id}`}
                    subtitle={`From ${directions.entry}`}
                    steps={directions.steps}
                    accent="blue"
                  />
                )}
                {exitDirections && exitDirections.pos_x !== null && (
                  <NavigationPanel
                    title={`Head to ${exitDirections.exit}`}
                    subtitle={`From slot ${exitDirections.slot_id}`}
                    steps={exitDirections.steps}
                    accent="amber"
                  />
                )}
              </>
            ) : (
              <div className="sticky top-24 space-y-4">
                <GateActions
                  gateQrPayload={gateQrPayload}
                  setGateQrPayload={setGateQrPayload}
                  handleCheckIn={handleCheckIn}
                  handlePreviewBill={handlePreviewBill}
                  checkoutBill={checkoutBill}
                  handleCompletePayment={handleCompletePayment}
                  entryPoint={entryPoint}
                  setEntryPoint={setEntryPoint}
                  exitPoint={exitPoint}
                  setExitPoint={setExitPoint}
                />
                {directions && directions.pos_x !== null && (
                  <NavigationPanel
                    title={`Navigate to ${directions.slot_id}`}
                    subtitle={`From ${directions.entry}`}
                    steps={directions.steps}
                    accent="blue"
                  />
                )}
                {exitDirections && exitDirections.pos_x !== null && (
                  <NavigationPanel
                    title={`Head to ${exitDirections.exit}`}
                    subtitle={`From slot ${exitDirections.slot_id}`}
                    steps={exitDirections.steps}
                    accent="amber"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <BookingModal
          open={!!selectedSlot}
          slot={selectedSlot}
          onClose={() => setSelectedSlot(null)}
          onSuccess={handleBookingSuccess}
          setError={setError}
        />

        <Toast 
          message={gateMessage?.message} 
          type={gateMessage?.type} 
          onClose={() => setGateMessage(null)} 
        />
      </div>
    </div>
  );
}

const QRCodeScreen = ({ booking, entryPoint, setEntryPoint, onDownload, onUseQr, onCopyPayload }) => (
  <div className="bg-[--bg-surface] border border-[--border] rounded-xl p-6 text-center">
    <h2 className="text-2xl font-display font-bold mb-2">Booking Confirmed</h2>
    <p className="text-[--text-muted] text-sm mb-4">Scan this QR at the entry gate or use the actions below.</p>

    {/* Entry gate selector */}
    <div className="text-left mb-4">
      <p className="text-xs uppercase tracking-widest text-[--text-muted] mb-2 font-semibold">Entry Gate</p>
      <div className="flex gap-3">
        {['A', 'B'].map(ep => (
          <button key={ep} type="button" onClick={() => setEntryPoint(ep)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
              entryPoint === ep
                ? 'bg-[--accent-blue] text-white border-[--accent-blue]'
                : 'bg-[--bg-elevated] text-[--text-muted] border-[--border] hover:border-[--accent-blue]'
            }`}>
            Entry {ep}
          </button>
        ))}
      </div>
    </div>

    <div className="relative inline-block bg-white p-4 rounded-lg shadow-lg overflow-hidden mb-4">
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${booking.qr_payload}`}
        alt="Booking QR Code"
        className="z-10 w-[200px] h-[200px]"
      />
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-[--accent-blue]/50 to-transparent animate-scanline z-20" />
    </div>

    <div className="text-left space-y-3 mb-4">
      {[
        { label: 'Slot ID', value: booking.slot_id },
        { label: 'Driver',  value: booking.driver_name },
        { label: 'Vehicle', value: booking.vehicle_number },
        { label: 'Arrival', value: new Date(booking.arrival_time).toLocaleTimeString() },
      ].map(({ label, value }, i, arr) => (
        <div key={label} className={`flex justify-between ${i < arr.length - 1 ? 'pb-3 border-b border-[--border]' : ''}`}>
          <span className="text-[--text-muted] text-sm">{label}</span>
          <span className="font-medium text-sm">{value}</span>
        </div>
      ))}
    </div>

    <div className="text-sm text-left font-mono break-words bg-[--bg-elevated] p-3 rounded-md mb-4">{booking.qr_payload}</div>

    <div className="flex gap-3">
      <button onClick={() => onUseQr && onUseQr(booking.qr_payload)}
        className="flex-1 bg-[--accent-green] text-black font-bold py-3 rounded-lg hover:brightness-105 transition-all">
        Check-In Now
      </button>
      <button onClick={() => onCopyPayload && onCopyPayload(booking.qr_payload)}
        className="flex-1 border border-[--border] rounded-lg py-3 text-[--text-muted]">
        Copy Payload
      </button>
    </div>

    <button onClick={() => onDownload && onDownload(booking.qr_payload)}
      className="w-full mt-4 py-3 rounded-lg border-2 border-[--accent-blue] text-[--accent-blue] font-semibold hover:bg-[--accent-blue]/10 transition-colors">
      Download Token
    </button>
  </div>
);

const GateActions = ({
  gateQrPayload, setGateQrPayload,
  handleCheckIn, handlePreviewBill,
  checkoutBill, handleCompletePayment,
  entryPoint, setEntryPoint,
  exitPoint, setExitPoint,
}) => (
  <div className="bg-[--bg-surface] border border-[--border] rounded-xl p-6 space-y-6">
    <div>
      <h3 className="text-xl font-bold mb-1">Gate Operations</h3>
      <p className="text-sm text-[--text-muted] mb-4">Enter your booking QR payload to check-in or check-out.</p>
      <input
        type="text"
        value={gateQrPayload}
        onChange={(e) => setGateQrPayload(e.target.value)}
        placeholder="Paste QR Payload..."
        className="w-full bg-[--bg-elevated] border border-[--border] rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[--accent-blue] outline-none"
      />
    </div>

    {/* Entry gate selector */}
    <div>
      <p className="text-xs uppercase tracking-widest text-[--text-muted] mb-2 font-semibold">Entry Gate</p>
      <div className="flex gap-3">
        {['A', 'B'].map(ep => (
          <button key={ep} type="button" onClick={() => setEntryPoint(ep)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
              entryPoint === ep
                ? 'bg-[--accent-blue] text-white border-[--accent-blue]'
                : 'bg-[--bg-elevated] text-[--text-muted] border-[--border] hover:border-[--accent-blue]'
            }`}>
            Entry {ep}
          </button>
        ))}
      </div>
    </div>

    {/* Exit gate selector */}
    <div>
      <p className="text-xs uppercase tracking-widest text-[--text-muted] mb-2 font-semibold">Exit Gate</p>
      <div className="flex gap-3">
        {['A', 'B'].map(ep => (
          <button key={ep} type="button" onClick={() => setExitPoint(ep)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
              exitPoint === ep
                ? 'bg-[--accent-amber] text-black border-[--accent-amber]'
                : 'bg-[--bg-elevated] text-[--text-muted] border-[--border] hover:border-[--accent-amber]'
            }`}>
            Exit {ep}
          </button>
        ))}
      </div>
    </div>

    <div className="flex gap-3">
      <button onClick={handleCheckIn} className="btn-primary flex-1 text-sm py-3 flex items-center justify-center font-semibold">Check-In</button>
      <button onClick={handlePreviewBill} className="flex-1 bg-[--accent-amber] text-black font-semibold rounded-lg py-3 hover:brightness-110 transition-all text-sm flex items-center justify-center">Check-Out</button>
    </div>

    {checkoutBill && (
      <div className="border-t border-[--border] pt-6">
        <h4 className="text-lg font-bold mb-4">Bill Preview</h4>
        <div className="space-y-3 text-sm mb-6">
          <div className="flex justify-between"><span className="text-[--text-muted]">Duration:</span> <span className="font-medium">{checkoutBill.duration_hours.toFixed(2)} hours</span></div>
          <div className="flex justify-between"><span className="text-[--text-muted]">Rate:</span> <span className="font-medium">₹{checkoutBill.rate_per_hour}/hr</span></div>
          <div className="flex justify-between text-lg font-bold mt-4 pt-4 border-t border-[--border]"><span>Total:</span> <span className="text-[--accent-green]">₹{checkoutBill.amount_charged}</span></div>
        </div>
        <button onClick={handleCompletePayment} className="w-full bg-[--accent-green] text-black font-bold py-3 rounded-lg hover:brightness-110 transition-all flex items-center justify-center">
          Pay ₹{checkoutBill.amount_charged}
        </button>
      </div>
    )}
  </div>
);

/* ── NavigationPanel ──────────────────────────────────────────────────── */
const NavigationPanel = ({ title, subtitle, steps, accent, miniMap }) => {
  const accentVar = accent === 'amber' ? 'var(--accent-amber)' : 'var(--accent-blue)';
  return (
    <div className="mt-8 bg-[--bg-surface] border border-[--border] rounded-xl p-6"
      style={{ borderLeftColor: accentVar, borderLeftWidth: 4 }}>
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1">
          <h3 className="text-xl font-bold mb-1" style={{ color: accentVar }}>{title}</h3>
          <p className="text-sm text-[--text-muted] mb-4">{subtitle}</p>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: `${accentVar}22`, color: accentVar }}>
                  {i + 1}
                </span>
                <span className="text-sm text-[--text-primary] leading-relaxed pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        {miniMap && <div className="flex-shrink-0">{miniMap}</div>}
      </div>
    </div>
  );
};

/* ── ParkingMiniMap ───────────────────────────────────────────────────── */
// Grid constants mirror the backend (GRID_COLS=10, GRID_ROWS=11)
const GRID_COLS = 10;
const GRID_ROWS = 11;
const CELL = 24; // px per grid cell
const PAD  = 24; // px padding (room for gate label text above/below)

// Gates are corner cells *inside* the grid:
//   Entry A → (col 0, row 0)            Entry B → (col 9, row 0)
//   Exit  A → (col 0, row 10)           Exit  B → (col 9, row 10)

// const ParkingMiniMap = ({ directions, mode, gateKey }) => {
//   const svgW = GRID_COLS * CELL + PAD * 2;
//   const svgH = GRID_ROWS * CELL + PAD * 2; // no extra rows — gates are inside the grid

//   // Grid (col, row) → SVG pixel centre (no row offset needed)
//   const cx = (col) => PAD + col * CELL + CELL / 2;
//   const cy = (row) => PAD + row * CELL + CELL / 2;

//   const gateCol = gateKey === 'B' ? GRID_COLS - 1 : 0;
//   const { pos_x, pos_y } = directions;
//   const accentColor = mode === 'entry' ? 'var(--accent-blue)' : 'var(--accent-amber)';

//   // Build path: gate corner → aisle → row → slot  (entry)
//   //             slot → row → aisle → gate corner   (exit)
//   let points = [];
//   if (mode === 'entry') {
//     const gateRow = 0; // entry gates sit at row 0
//     points = [
//       [cx(gateCol), cy(gateRow)],   // start: gate corner
//       [cx(gateCol), cy(pos_y)],     // descend aisle to slot's row
//       [cx(pos_x),   cy(pos_y)],     // traverse row to slot
//     ];
//   } else {
//     const gateRow = GRID_ROWS - 1; // exit gates sit at last row
//     points = [
//       [cx(pos_x),   cy(pos_y)],     // start: slot
//       [cx(gateCol), cy(pos_y)],     // traverse row to aisle
//       [cx(gateCol), cy(gateRow)],   // descend aisle to exit corner
//     ];
//   }

//   const polylineStr = points.map(([x, y]) => `${x},${y}`).join(' ');
//   const gateRow    = mode === 'entry' ? 0 : GRID_ROWS - 1;
//   const gateLabel  = mode === 'entry' ? `Entry ${gateKey}` : `Exit ${gateKey}`;
//   // Label sits above the SVG for entry, below for exit
//   const labelY     = mode === 'entry' ? PAD - 8 : svgH - 4;

//   return (
//     <svg width={svgW} height={svgH} style={{ background: 'var(--bg-elevated)', borderRadius: 12, display: 'block' }}>
//       {/* Grid cells */}
//       {Array.from({ length: GRID_ROWS }).map((_, r) =>
//         Array.from({ length: GRID_COLS }).map((_, c) => (
//           <rect key={`${r}-${c}`}
//             x={PAD + c * CELL + 1} y={PAD + r * CELL + 1}
//             width={CELL - 2} height={CELL - 2}
//             rx={2} fill="var(--bg-surface)" opacity={0.7} />
//         ))
//       )}

//       {/* Target slot highlight */}
//       {pos_x !== null && pos_y !== null && (
//         <rect x={PAD + pos_x * CELL + 1} y={PAD + pos_y * CELL + 1}
//           width={CELL - 2} height={CELL - 2} rx={2}
//           fill={accentColor} opacity={0.3} />
//       )}

//       {/* Gate corner cell overlay */}
//       <rect x={PAD + gateCol * CELL + 1} y={PAD + gateRow * CELL + 1}
//         width={CELL - 2} height={CELL - 2} rx={2}
//         fill={accentColor} opacity={0.65}
//         stroke={accentColor} strokeWidth={1.5} />
//       <text x={cx(gateCol)} y={cy(gateRow)}
//         textAnchor="middle" dominantBaseline="middle"
//         fontSize={7} fontWeight="bold" fill="white" fontFamily="monospace">
//         {gateKey}
//       </text>

//       {/* Navigation path */}
//       <polyline points={polylineStr}
//         fill="none" stroke={accentColor} strokeWidth={2.5}
//         strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 3" />

//       {/* Start dot */}
//       <circle cx={points[0][0]} cy={points[0][1]} r={5} fill={accentColor} />
//       {/* End dot */}
//       {points.length > 1 && (
//         <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]}
//           r={5} fill={accentColor} opacity={0.55} />
//       )}

//       {/* Gate label (above/below SVG area within padding) */}
//       <text x={cx(gateCol)} y={labelY}
//         textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontFamily="monospace">
//         {gateLabel}
//       </text>
//     </svg>
//   );
// };

export default DriverPage;
