import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';

/* ─── Types ─── */
interface GraphNode {
  id: string;
  username: string | null;
  reputation: number;
  aura: number;
  isAncient: boolean;
  // simulation state
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  edgeType: string;
  recent?: boolean;
}

interface Props {
  userId: string;
  /** Start in extended (2-3 hop) mode */
  extended?: boolean;
}

/* ─── Constants ─── */
const MAX_VISIBLE = 50;
const NODE_MIN_R = 8;
const NODE_MAX_R = 28;
const EDGE_MIN_W = 0.5;
const EDGE_MAX_W = 5;
const DAMPING = 0.92;
const REPULSION = 3000;
const ATTRACTION = 0.005;
const CENTER_GRAVITY = 0.01;

/* ─── Helpers ─── */
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function nodeRadius(rep: number, maxRep: number) {
  if (maxRep <= 0) return NODE_MIN_R;
  return lerp(NODE_MIN_R, NODE_MAX_R, Math.sqrt(rep / maxRep));
}

function glowAlpha(aura: number, maxAura: number) {
  if (maxAura <= 0) return 0;
  return clamp(aura / maxAura, 0, 1);
}

function edgeWidth(w: number, maxW: number) {
  if (maxW <= 0) return EDGE_MIN_W;
  return lerp(EDGE_MIN_W, EDGE_MAX_W, w / maxW);
}

function hueFromId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 37) % 360;
  return h;
}

/* ─── Force simulation step ─── */
function simulateStep(nodes: GraphNode[], edges: GraphEdge[], w: number, h: number) {
  const cx = w / 2, cy = h / 2;

  // Repulsion between all pairs
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      nodes[i].vx += fx;
      nodes[i].vy += fy;
      nodes[j].vx -= fx;
      nodes[j].vy -= fy;
    }
  }

  // Attraction along edges
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (!s || !t) continue;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = dist * ATTRACTION * (1 + e.weight * 0.1);
    s.vx += (dx / dist) * force;
    s.vy += (dy / dist) * force;
    t.vx -= (dx / dist) * force;
    t.vy -= (dy / dist) * force;
  }

  // Center gravity + integrate
  for (const n of nodes) {
    n.vx += (cx - n.x) * CENTER_GRAVITY;
    n.vy += (cy - n.y) * CENTER_GRAVITY;
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x += n.vx;
    n.y += n.vy;
    n.x = clamp(n.x, 30, w - 30);
    n.y = clamp(n.y, 30, h - 30);
  }
}

/* ─── Main Component ─── */
export default function InfluenceGraph({ userId, extended = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animRef = useRef<number>(0);
  const panRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false, lastX: 0, lastY: 0,
  });
  const selectedRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'local' | 'extended'>(extended ? 'extended' : 'local');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [trending, setTrending] = useState<any[]>([]);

  /* ─── Data fetching ─── */
  const loadNode = useCallback(async (username: string, isRoot = false) => {
    try {
      const data = await api.getGraphNode(username);
      const existing = new Set(nodesRef.current.map((n) => n.id));
      const w = containerRef.current?.clientWidth || 600;
      const h = containerRef.current?.clientHeight || 400;

      // Add center node
      if (!existing.has(data.node?.id ?? username)) {
        const node: GraphNode = {
          id: data.node?.id ?? username,
          username: data.node?.username ?? username,
          reputation: data.node?.reputation ?? 0,
          aura: data.node?.aura ?? 0,
          isAncient: data.node?.isAncient ?? false,
          x: isRoot ? w / 2 : w / 2 + (Math.random() - 0.5) * 200,
          y: isRoot ? h / 2 : h / 2 + (Math.random() - 0.5) * 200,
          vx: 0, vy: 0,
        };
        nodesRef.current = [...nodesRef.current, node].slice(0, MAX_VISIBLE);
      }

      // Add neighbors
      const neighbors = data.neighbors ?? [];
      for (const nb of neighbors) {
        if (!existing.has(nb.id) && nodesRef.current.length < MAX_VISIBLE) {
          nodesRef.current.push({
            id: nb.id,
            username: nb.username,
            reputation: nb.reputation ?? 0,
            aura: nb.aura ?? 0,
            isAncient: nb.isAncient ?? false,
            x: w / 2 + (Math.random() - 0.5) * 300,
            y: h / 2 + (Math.random() - 0.5) * 300,
            vx: 0, vy: 0,
          });
        }
      }

      // Add edges
      const edgeSet = new Set(edgesRef.current.map((e) => `${e.source}-${e.target}`));
      const newEdges = (data.edges ?? []).filter(
        (e: any) => !edgeSet.has(`${e.source}-${e.target}`)
      );
      edgesRef.current = [...edgesRef.current, ...newEdges.map((e: any) => ({
        source: e.source ?? e.from,
        target: e.target ?? e.to,
        weight: e.weight ?? 1,
        edgeType: e.edgeType ?? e.edge_type ?? 'unknown',
        recent: e.recent ?? false,
      }))];
    } catch {
      // Silently handle — graph is supplementary
    }
  }, []);

  /* ─── Initial load ─── */
  useEffect(() => {
    nodesRef.current = [];
    edgesRef.current = [];
    setLoading(true);

    (async () => {
      // Try to resolve username from userId
      try {
        const user = await api.getUser(userId);
        const uname = user?.username ?? userId;
        await loadNode(uname, true);

        // Extended mode: load 2nd-hop neighbors
        if (viewMode === 'extended') {
          const firstHop = nodesRef.current.filter((n) => n.id !== (user?.id ?? userId));
          for (const n of firstHop.slice(0, 5)) {
            if (n.username) await loadNode(n.username);
          }
        }
      } catch {
        // Fallback: try userId directly
        await loadNode(userId, true);
      }
      setLoading(false);
    })();
  }, [userId, viewMode, loadNode]);

  /* ─── Load trending for "Follow the Alpha" ─── */
  useEffect(() => {
    api.getGraphTrending()
      .then((d: any) => setTrending(d?.trending ?? d ?? []))
      .catch(() => {});
  }, []);

  /* ─── Canvas rendering loop ─── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let pulsePhase = 0;

    const render = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const nodes = nodesRef.current;
      const edges = edgesRef.current;

      if (nodes.length > 0) {
        simulateStep(nodes, edges, w, h);
      }

      const { x: px, y: py, scale } = panRef.current;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(scale, scale);

      pulsePhase += 0.03;

      const maxRep = Math.max(...nodes.map((n) => n.reputation), 1);
      const maxAura = Math.max(...nodes.map((n) => n.aura), 1);
      const maxWeight = Math.max(...edges.map((e) => e.weight), 1);

      // Draw edges
      for (const e of edges) {
        const s = nodes.find((n) => n.id === e.source);
        const t = nodes.find((n) => n.id === e.target);
        if (!s || !t) continue;

        const ew = edgeWidth(e.weight, maxWeight);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = e.recent
          ? `rgba(16,185,129,${0.4 + 0.3 * Math.sin(pulsePhase * 2)})`
          : 'rgba(148,163,184,0.25)';
        ctx.lineWidth = ew;
        ctx.stroke();
      }

      // Draw nodes
      for (const n of nodes) {
        const r = nodeRadius(n.reputation, maxRep);
        const ga = glowAlpha(n.aura, maxAura);
        const hue = hueFromId(n.id);
        const isSelected = selectedRef.current === n.id;

        // Aura glow
        if (ga > 0.1) {
          const glowR = r + 6 + ga * 10;
          const grad = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, glowR);
          const glowColor = n.isAncient ? '168,85,247' : '16,185,129';
          grad.addColorStop(0, `rgba(${glowColor},${ga * 0.5})`);
          grad.addColorStop(1, `rgba(${glowColor},0)`);
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.isAncient
          ? `hsl(280, 60%, 55%)`
          : `hsl(${hue}, 55%, 50%)`;
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.max(9, r * 0.6)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = n.username?.[0]?.toUpperCase() || '?';
        ctx.fillText(label, n.x, n.y);

        // Username below
        if (r > 12 && n.username) {
          ctx.fillStyle = 'rgba(100,116,139,0.8)';
          ctx.font = '10px system-ui, sans-serif';
          ctx.fillText(n.username, n.x, n.y + r + 12);
        }
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [loading]);

  /* ─── Interaction handlers ─── */
  const screenToGraph = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { gx: 0, gy: 0 };
    const { x: px, y: py, scale } = panRef.current;
    return {
      gx: (clientX - rect.left - px) / scale,
      gy: (clientY - rect.top - py) / scale,
    };
  };

  const findNodeAt = (gx: number, gy: number) => {
    const maxRep = Math.max(...nodesRef.current.map((n) => n.reputation), 1);
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const r = nodeRadius(n.reputation, maxRep);
      const dx = gx - n.x, dy = gy - n.y;
      if (dx * dx + dy * dy <= (r + 4) * (r + 4)) return n;
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    panRef.current.x += dx;
    panRef.current.y += dy;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const wasDrag = Math.abs(e.clientX - dragRef.current.lastX) > 3 ||
                    Math.abs(e.clientY - dragRef.current.lastY) > 3;
    dragRef.current.dragging = false;

    if (wasDrag) return;

    // Tap → select node, center, load neighbors
    const { gx, gy } = screenToGraph(e.clientX, e.clientY);
    const node = findNodeAt(gx, gy);
    if (node) {
      selectedRef.current = node.id;
      setSelectedNode(node);
      // Center on node with smooth pan
      const container = containerRef.current;
      if (container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        const { scale } = panRef.current;
        panRef.current.x = w / 2 - node.x * scale;
        panRef.current.y = h / 2 - node.y * scale;
      }
      // Load neighbors
      if (node.username) loadNode(node.username);
    } else {
      selectedRef.current = null;
      setSelectedNode(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    panRef.current.scale = clamp(panRef.current.scale * delta, 0.3, 3);
  };

  /* ─── Follow the Alpha (Task 20.2) ─── */
  const handleFollowAlpha = async () => {
    if (trending.length === 0) return;
    const top = trending[0];
    const username = top.username ?? top.id;
    if (username) {
      nodesRef.current = [];
      edgesRef.current = [];
      panRef.current = { x: 0, y: 0, scale: 1 };
      await loadNode(username, true);
    }
  };

  /* ─── Render ─── */
  if (loading && nodesRef.current.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('local')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${
              viewMode === 'local' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            1-hop
          </button>
          <button
            onClick={() => setViewMode('extended')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${
              viewMode === 'extended' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Extended
          </button>
        </div>

        {trending.length > 0 && (
          <button
            onClick={handleFollowAlpha}
            className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold rounded-lg hover:shadow-md transition-all"
          >
            🔥 Follow the Alpha
          </button>
        )}

        <span className="text-xs text-gray-400 ml-auto">
          {nodesRef.current.length}/{MAX_VISIBLE} nodes
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative w-full h-[400px] bg-slate-50 rounded-2xl border border-gray-100 overflow-hidden cursor-grab active:cursor-grabbing"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          className="w-full h-full touch-none"
        />
      </div>

      {/* Selected node info */}
      {selectedNode && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3"
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
            selectedNode.isAncient ? 'bg-purple-500' : 'bg-emerald-500'
          }`}>
            {selectedNode.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {selectedNode.username || 'Anonymous'}
            </p>
            <p className="text-xs text-gray-500">
              Rep {selectedNode.reputation.toFixed(1)} · Aura {selectedNode.aura.toFixed(1)}
              {selectedNode.isAncient && ' · 🏛 Ancient'}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
