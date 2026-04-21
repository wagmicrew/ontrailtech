import { useState, useEffect } from 'react';

export default function TaskbarClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right text-white/80 text-xs leading-tight px-2">
      <div className="font-semibold">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="text-white/50">{time.toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>
    </div>
  );
}
