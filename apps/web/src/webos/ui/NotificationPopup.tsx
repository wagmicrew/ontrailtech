import { useSnapshot } from 'valtio';
import { systemStore, dismissNotification } from '../core/system-store';

export default function NotificationPopup() {
  const snap = useSnapshot(systemStore);
  return (
    <div className="absolute bottom-12 right-2 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-[9000]">
      <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-400 font-semibold uppercase tracking-wider">Notifications</div>
      {snap.notifications.length === 0 ? (
        <div className="px-3 py-4 text-sm text-gray-500 text-center">No notifications</div>
      ) : (
        <div className="max-h-64 overflow-y-auto divide-y divide-gray-800">
          {snap.notifications.map(n => (
            <div key={n.id} className="flex items-start gap-2 px-3 py-2.5">
              <div className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                n.type === 'error' ? 'bg-red-400' : n.type === 'success' ? 'bg-green-400' : 'bg-blue-400'
              }`} />
              <span className="text-xs text-gray-300 flex-1">{n.message}</span>
              <button onClick={() => dismissNotification(n.id)} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
