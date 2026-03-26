import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function Tokens() {
  const { isConnected } = useAuth();
  const [runnerId, setRunnerId] = useState('');
  const [amount, setAmount] = useState(1);
  const [quote, setQuote] = useState<any>(null);
  const [pool, setPool] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const getQuote = async () => {
    if (!runnerId) return;
    try {
      const [q, p] = await Promise.all([
        api.getPrice(runnerId, amount),
        api.getPoolStatus(runnerId),
      ]);
      setQuote(q); setPool(p);
    } catch (err: any) { setMessage(err.message); }
  };

  const handleBuy = async () => {
    setLoading(true); setMessage('');
    try {
      const result = await api.buyShares(runnerId, amount);
      setMessage(`Bought ${result.amount} shares for ${result.price} ETH`);
      getQuote();
    } catch (err: any) { setMessage(err.message); }
    setLoading(false);
  };

  const handleSell = async () => {
    setLoading(true); setMessage('');
    try {
      const result = await api.sellShares(runnerId, amount);
      setMessage(`Sold ${result.amount} shares for ${result.price} ETH`);
      getQuote();
    } catch (err: any) { setMessage(err.message); }
    setLoading(false);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Token Dashboard</h2>
      <p className="text-gray-500 mb-6">Invest in runners via bonding curves.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Trading Panel */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-4">Trade Runner Shares</h3>
          <div className="space-y-3">
            <input type="text" value={runnerId} onChange={(e) => setRunnerId(e.target.value)}
              placeholder="Runner ID" className="w-full border rounded px-3 py-2 text-sm" />
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))}
              min={1} className="w-full border rounded px-3 py-2 text-sm" />
            <button onClick={getQuote}
              className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-200">
              Get Price Quote
            </button>
            {quote && (
              <div className="bg-gray-50 rounded p-3 text-sm">
                <p>Price per share: <span className="font-mono">{quote.price_per_share} ETH</span></p>
                <p>Total cost: <span className="font-mono">{quote.total_cost} ETH</span></p>
                <p>Current supply: <span className="font-mono">{quote.current_supply}</span></p>
              </div>
            )}
            {isConnected && (
              <div className="flex gap-2">
                <button onClick={handleBuy} disabled={loading || !runnerId}
                  className="flex-1 bg-green-500 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50">
                  {loading ? '...' : 'Buy'}
                </button>
                <button onClick={handleSell} disabled={loading || !runnerId}
                  className="flex-1 bg-red-500 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50">
                  {loading ? '...' : 'Sell'}
                </button>
              </div>
            )}
            {message && <p className="text-sm text-ontrail-700">{message}</p>}
          </div>
        </div>

        {/* Pool Status */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-4">Pool Status</h3>
          {pool ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Supply</span>
                <span className="font-mono">{pool.current_supply}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Pool</span>
                <span className="font-mono">{pool.liquidity_pool} ETH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">TGE Threshold</span>
                <span className="font-mono">{pool.threshold} ETH</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-ontrail-500 h-3 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (parseFloat(pool.liquidity_pool) / parseFloat(pool.threshold)) * 100)}%` }} />
              </div>
              <p className={`text-sm font-medium ${pool.ready_for_tge ? 'text-green-600' : 'text-gray-500'}`}>
                {pool.ready_for_tge ? '🚀 Ready for TGE!' : 'Building towards TGE...'}
              </p>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Enter a runner ID and get a quote to see pool status.</p>
          )}
        </div>
      </div>
    </div>
  );
}
