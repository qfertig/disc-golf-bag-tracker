'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wind, Thermometer, CloudRain, RefreshCw } from 'lucide-react';
import { fetchWeather, windDescription, windDirectionLabel, celsiusToFahrenheit, type WeatherData } from '@/lib/services/weather';

interface WeatherWidgetProps {
  lat: number | null;
  lon: number | null;
  compact?: boolean;
}

export default function WeatherWidget({ lat, lon, compact = false }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    if (lat == null || lon == null) return;
    setLoading(true);
    setUnavailable(false);
    const result = await fetchWeather(lat, lon);
    setLoading(false);
    if (result.ok) {
      setWeather(result.data);
    } else {
      setUnavailable(true);
    }
  }, [lat, lon]);

  useEffect(() => { load(); }, [load]);

  // Unavailable state
  if (unavailable) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-2)] text-[var(--text-muted)] text-xs font-semibold">
        <CloudRain size={13} />
        <span>Weather unavailable</span>
        <button onClick={load} className="ml-auto opacity-50 hover:opacity-100 active:scale-90 transition-all">
          <RefreshCw size={12} />
        </button>
      </div>
    );
  }

  // Loading state
  if (loading || !weather) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-2)] text-[var(--text-muted)] text-xs">
        <div className="w-3 h-3 rounded-full border border-[var(--text-muted)] border-t-transparent animate-spin" />
        <span className="font-semibold">Loading weather...</span>
      </div>
    );
  }

  const { current } = weather;
  const tempF = celsiusToFahrenheit(current.temperature_c);
  const windDesc = windDescription(current.wind_speed_kmh);
  const windDir = windDirectionLabel(current.wind_direction_deg);
  const windHigh = current.wind_speed_kmh > 25;

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--surface-2)] text-[var(--text-muted)]">
        <div className="flex items-center gap-1 text-[var(--text-primary)]">
          <Thermometer size={13} className="text-[var(--primary)]" />
          <span className="text-xs font-bold">{tempF}°F</span>
        </div>
        <div className={`flex items-center gap-1 ${windHigh ? 'text-amber-400' : 'text-[var(--text-muted)]'}`}>
          <Wind size={13} />
          <span className="text-xs font-bold">{Math.round(current.wind_speed_kmh)} km/h {windDir}</span>
        </div>
        {current.is_stale && (
          <span className="text-[10px] text-[var(--text-muted)] opacity-60 ml-auto">{current.stale_label}</span>
        )}
      </div>
    );
  }

  // Find current hour precipitation probability
  const now = new Date();
  const currentHour = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:00`;
  const precipEntry = weather.hourly.find(h => h.time === currentHour);
  const precipProb = precipEntry?.precipitation_probability ?? 0;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">
          Current Conditions
        </span>
        {current.is_stale && (
          <span className="text-[10px] text-[var(--text-muted)] opacity-60">{current.stale_label}</span>
        )}
        <button onClick={load} className="text-[var(--text-muted)] opacity-50 hover:opacity-100 active:scale-90 transition-all">
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="flex items-center gap-4">
        {/* Temperature */}
        <div className="flex flex-col items-center gap-0.5 min-w-[52px]">
          <Thermometer size={18} className="text-[var(--primary)]" />
          <span className="text-lg font-black text-[var(--text-primary)]">{tempF}°F</span>
          <span className="text-[10px] text-[var(--text-muted)]">{Math.round(current.temperature_c)}°C</span>
        </div>

        <div className="w-px h-10 bg-[var(--border)]" />

        {/* Wind */}
        <div className="flex flex-col gap-0.5 flex-1">
          <div className={`flex items-center gap-1.5 ${windHigh ? 'text-amber-400' : 'text-[var(--text-muted)]'}`}>
            <Wind size={14} />
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {Math.round(current.wind_speed_kmh)} km/h {windDir}
            </span>
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
            {windDesc} wind
            {windHigh ? ' — favor overstable discs' : ''}
          </span>
        </div>

        {/* Rain */}
        <div className="flex flex-col items-center gap-0.5 min-w-[44px]">
          <CloudRain size={16} className={precipProb > 50 ? 'text-blue-400' : 'text-[var(--text-muted)]'} />
          <span className={`text-sm font-bold ${precipProb > 50 ? 'text-blue-400' : 'text-[var(--text-muted)]'}`}>
            {precipProb}%
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">rain</span>
        </div>
      </div>
    </div>
  );
}
