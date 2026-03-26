import { useRef, useCallback } from 'react';

type CardVariant = 'emerald' | 'purple' | 'amber' | 'blue';

const VARIANT_STYLES: Record<CardVariant, string> = {
  emerald: 'from-emerald-600 to-green-500',
  purple: 'from-purple-600 to-pink-500',
  amber: 'from-amber-500 to-orange-500',
  blue: 'from-blue-600 to-cyan-500',
};

interface ShareableCardProps {
  avatar?: string;
  headline: string;
  subheadline?: string;
  stats: { label: string; value: string }[];
  username?: string;
  variant?: CardVariant;
  cardUrl?: string;
}

export default function ShareableCard({
  avatar, headline, subheadline, stats, username, variant = 'emerald', cardUrl,
}: ShareableCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const downloadAsPng = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(cardRef.current, { backgroundColor: null, scale: 2 });
      const link = document.createElement('a');
      link.download = `ontrail-${username || 'card'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [username]);

  const shareOnX = () => {
    const text = encodeURIComponent(`${headline}\n\n${username ? `${username}.ontrail.tech` : 'ontrail.tech'}\n\n#OnTrail`);
    window.open(`https://twitter.com/intent/tweet?text=${text}${cardUrl ? `&url=${encodeURIComponent(cardUrl)}` : ''}`, '_blank');
  };

  const copyLink = () => {
    if (cardUrl) navigator.clipboard.writeText(cardUrl);
  };

  return (
    <div className="space-y-4">
      {/* Card */}
      <div ref={cardRef}
        className={`relative bg-gradient-to-br ${VARIANT_STYLES[variant]} rounded-2xl p-6 overflow-hidden w-full max-w-sm mx-auto`}>
        {/* Watermark */}
        <img src="/ontrail-logo.png" alt="" className="absolute bottom-3 right-3 h-5 opacity-20 brightness-0 invert" />

        <div className="relative z-10 space-y-4">
          {avatar && <div className="text-4xl">{avatar}</div>}
          <h3 className="text-xl font-bold text-white">{headline}</h3>
          {subheadline && <p className="text-sm text-white/70">{subheadline}</p>}

          <div className="flex gap-4">
            {stats.slice(0, 3).map((s, i) => (
              <div key={i}>
                <p className="text-lg font-bold text-white">{s.value}</p>
                <p className="text-xs text-white/60">{s.label}</p>
              </div>
            ))}
          </div>

          {username && (
            <p className="text-xs text-white/50 mt-2">{username}.ontrail.tech</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 max-w-sm mx-auto">
        <button onClick={shareOnX}
          className="flex-1 bg-black text-white py-2.5 rounded-xl text-sm font-semibold border border-white/10">
          Share on 𝕏
        </button>
        <button onClick={copyLink}
          className="flex-1 bg-white/5 text-white py-2.5 rounded-xl text-sm font-semibold border border-white/10">
          Copy link
        </button>
        <button onClick={downloadAsPng}
          className="flex-1 bg-white/5 text-white py-2.5 rounded-xl text-sm font-semibold border border-white/10">
          Download
        </button>
      </div>
    </div>
  );
}