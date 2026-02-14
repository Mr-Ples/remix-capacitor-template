import { useState, useRef, useEffect } from 'react';

interface DurationPickerProps {
  label: string;
  value: number; // total seconds
  onChange: (seconds: number) => void;
  className?: string;
  presets?: { label: string; seconds: number }[];
}

export function DurationPicker({ 
  label, 
  value, 
  onChange, 
  className = '',
  presets = [
    { label: '5m', seconds: 5 * 60 },
    { label: '10m', seconds: 10 * 60 },
    { label: '15m', seconds: 15 * 60 },
    { label: '25m', seconds: 25 * 60 },
    { label: '50m', seconds: 50 * 60 },
  ]
}: DurationPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempHours, setTempHours] = useState(0);
  const [tempMinutes, setTempMinutes] = useState(0);
  const [tempSeconds, setTempSeconds] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Convert seconds to HMS for display
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;

  // Format display string
  const formatDuration = () => {
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
  };

  // Initialize temp values when opening
  const handleOpen = () => {
    setTempHours(hours);
    setTempMinutes(minutes);
    setTempSeconds(seconds);
    setIsOpen(true);
  };

  // Apply changes
  const handleApply = () => {
    const totalSeconds = tempHours * 3600 + tempMinutes * 60 + tempSeconds;
    onChange(totalSeconds);
    setIsOpen(false);
  };

  // Apply preset
  const handlePreset = (presetSeconds: number) => {
    const hrs = Math.floor(presetSeconds / 3600);
    const mins = Math.floor((presetSeconds % 3600) / 60);
    const secs = presetSeconds % 60;
    setTempHours(hrs);
    setTempMinutes(mins);
    setTempSeconds(secs);
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const ROW_HEIGHT = 40;
  const WHEEL_VISIBLE_HEIGHT = 128; // h-32 = 8rem

  // Scroll wheel component for each unit - cycles: above 0 is max (e.g. 59 above 00), hours cap at 23
  const ScrollWheel = ({ 
    wheelValue, 
    onWheelChange, 
    max, 
    unit 
  }: { 
    wheelValue: number; 
    onWheelChange: (v: number) => void; 
    max: number; 
    unit: string;
  }) => {
    const wheelRef = useRef<HTMLDivElement>(null);
    const touchStartY = useRef(0);
    const touchStartValue = useRef(0);
    const lastAppliedSteps = useRef(0);
    const [editStr, setEditStr] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const prevWheelValueRef = useRef(wheelValue);

    // When value changes from wheel/+/-/touch (not from typing), exit edit mode so display updates
    useEffect(() => {
      if (prevWheelValueRef.current !== wheelValue) {
        prevWheelValueRef.current = wheelValue;
        setEditStr(null);
      }
    }, [wheelValue]);

    // Cyclic order: [max-1, max, 0, 1, ..., max-2] so above max we show max-1 (e.g. above 59 show 58)
    const displayValues = [max - 1, max, ...Array.from({ length: max - 1 }, (_, i) => i)];
    const selectedIndex = (wheelValue + 2) % (max + 1);
    const cycleLength = max + 1;

    // Render THREE copies so there is always a row above and below (no empty slot at wrap)
    const repeatedValues = [...displayValues, ...displayValues, ...displayValues];
    // Center the middle copy's selected row: row index (cycleLength + selectedIndex) in the long list
    const centerRowIndex = cycleLength + selectedIndex;
    const translateY = -centerRowIndex * ROW_HEIGHT;

    const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      const newValue = wheelValue + delta;
      const wrapped = newValue < 0 ? max : newValue > max ? 0 : newValue;
      onWheelChange(wrapped);
    };

    const wrap = (v: number) => {
      let n = v % (max + 1);
      if (n < 0) n += max + 1;
      return n;
    };

    const handleTouchStart = (e: React.TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      touchStartValue.current = wheelValue;
      lastAppliedSteps.current = 0;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      const deltaY = e.touches[0].clientY - touchStartY.current;
      const steps = Math.round(deltaY / ROW_HEIGHT);
      if (steps === lastAppliedSteps.current) return;
      lastAppliedSteps.current = steps;
      const newValue = wrap(touchStartValue.current + steps);
      onWheelChange(newValue);
    };

    const handleDecrement = () => {
      onWheelChange(wheelValue === 0 ? max : wheelValue - 1);
    };

    const handleIncrement = () => {
      onWheelChange(wheelValue === max ? 0 : wheelValue + 1);
    };

    const displayValue = editStr !== null ? editStr : String(wheelValue).padStart(2, '0');

    const handleInputFocus = () => {
      setEditStr(String(wheelValue));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
      setEditStr(raw);
    };

    const handleInputBlur = () => {
      if (editStr === null) return;
      const num = parseInt(editStr, 10);
      const clamped = isNaN(num) ? wheelValue : Math.max(0, Math.min(max, num));
      onWheelChange(clamped);
      setEditStr(null);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        inputRef.current?.blur();
      }
    };

    return (
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs text-mutedForeground uppercase tracking-wider">{unit}</span>
        <div 
          ref={wheelRef}
          className="relative overflow-hidden rounded-lg bg-white/5 border border-white/10 select-none touch-none"
          style={{ height: WHEEL_VISIBLE_HEIGHT, width: 72 }}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
        >
          {/* Gradient overlays */}
          <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none" />
          
          {/* Selection highlight */}
          <div className="absolute top-1/2 left-0 right-0 h-10 -translate-y-1/2 bg-accent/20 border-y border-accent/40 pointer-events-none z-[1]" />
          
          {/* Three copies of the cycle so there is always a row above and below */}
          <div 
            className="flex flex-col items-center justify-start min-h-full transition-transform duration-150 ease-out"
            style={{ 
              transform: `translateY(${translateY}px)`,
              paddingTop: (WHEEL_VISIBLE_HEIGHT / 2) - ROW_HEIGHT / 2,
              paddingBottom: (WHEEL_VISIBLE_HEIGHT / 2) - ROW_HEIGHT / 2,
            }}
          >
            {repeatedValues.map((val, i) => (
              <button
                key={i}
                type="button"
                className={`flex items-center justify-center shrink-0 w-full transition-colors ${
                  val === wheelValue 
                    ? 'text-accent font-bold text-2xl' 
                    : 'text-mutedForeground text-lg'
                }`}
                style={{ height: ROW_HEIGHT, minHeight: ROW_HEIGHT }}
                onClick={() => onWheelChange(val)}
              >
                {String(val).padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>
        
        {/* Increment/Decrement buttons and editable value */}
        <div className="flex gap-1 items-center">
          <button
            type="button"
            className="w-8 h-8 rounded-md bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-lg font-medium transition-colors"
            onClick={handleDecrement}
            aria-label={`Decrease ${unit}`}
          >
            −
          </button>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={unit}
            value={displayValue}
            onFocus={handleInputFocus}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            className="w-10 text-center text-lg font-semibold tabular-nums bg-white/5 border border-white/10 rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50"
          />
          <button
            type="button"
            className="w-8 h-8 rounded-md bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-lg font-medium transition-colors"
            onClick={handleIncrement}
            aria-label={`Increase ${unit}`}
          >
            +
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`relative ${className}`}>
      <label className="text-xs font-medium uppercase tracking-widest text-mutedForeground px-1 block mb-2">
        {label}
      </label>
      
      {/* Display button */}
      <button
        type="button"
        className="input-field w-full text-left flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
        onClick={handleOpen}
      >
        <span className="font-medium">{formatDuration()}</span>
        <svg 
          className="w-5 h-5 text-mutedForeground" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {/* Picker modal */}
      {isOpen && (
        <div 
          ref={pickerRef}
          className="absolute top-full left-0 right-0 mt-2 p-6 rounded-xl bg-background border border-white/10 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* Presets */}
          {presets && presets.length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-mutedForeground uppercase tracking-wider mb-2 text-center">Quick Select</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-accent/20 hover:text-accent border border-white/10 hover:border-accent/40 transition-all"
                    onClick={() => handlePreset(preset.seconds)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scroll wheels */}
          <div className="flex gap-4 justify-center mb-6">
            <ScrollWheel wheelValue={tempHours} onWheelChange={setTempHours} max={23} unit="Hours" />
            <ScrollWheel wheelValue={tempMinutes} onWheelChange={setTempMinutes} max={59} unit="Minutes" />
            <ScrollWheel wheelValue={tempSeconds} onWheelChange={setTempSeconds} max={59} unit="Seconds" />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-secondary flex-1 py-2 text-sm"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary flex-1 py-2 text-sm"
              onClick={handleApply}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
