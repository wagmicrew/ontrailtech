// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Field {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

interface MessageType {
  id: string;
  name: string;
  description: string;
  type_definition: string;
  fields: Field[];
  query_template?: string;
  mutation_template?: string;
  lens_metadata_type: string;
  metadata_attributes?: Record<string, any>;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
}

interface Template {
  id: string;
  message_type_id: string;
  template_name: string;
  template_content: string;
  variables_schema: any;
  usage_count: number;
  is_active: boolean;
  created_at: string;
}

interface VariableMapping {
  fieldName: string;
  source: 'static' | 'user' | 'system';
  value: string;
  systemKey?: string;
}

interface CanvasNode {
  id: string;
  kind: 'type' | 'variable' | 'output';
  x: number;
  y: number;
  label: string;
  color: string;
  data?: any;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromField?: string;
  toField?: string;
  label?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const GQL_TYPES = ['String', 'Int', 'Float', 'Boolean', 'ID', '[String]', '[Int]', 'JSON', 'DateTime'];
const LENS_META_TYPES = ['POST', 'COMMENT', 'PROFILE', 'MIRROR', 'QUOTE'];
const SYSTEM_VARS = ['user.id', 'user.username', 'user.wallet', 'trail.id', 'trail.name', 'poi.id', 'timestamp.now'];
const NODE_COLORS = { type: '#6366f1', variable: '#10b981', output: '#f59e0b' };

// ─── Small helpers ───────────────────────────────────────────────────────────

function badge(label: string, color = 'bg-slate-100 text-slate-700') {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}>{label}</span>;
}

function typeColor(t: string) {
  if (t.startsWith('[')) return 'text-purple-600';
  if (t === 'Boolean') return 'text-amber-600';
  if (t === 'Int' || t === 'Float') return 'text-sky-600';
  if (t === 'JSON') return 'text-rose-600';
  return 'text-emerald-700';
}

function buildTypeDefinition(name: string, fields: Field[]): string {
  if (!fields.length) return `type ${name} {\n  # no fields yet\n}`;
  return `type ${name} {\n${fields.map(f => `  ${f.name}: ${f.type}${f.required ? '!' : ''}`).join('\n')}\n}`;
}

function buildMutationTemplate(name: string, fields: Field[]): string {
  const args = fields.filter(f => f.required).map(f => `$${f.name}: ${f.type}!`).join(', ');
  const vars = fields.filter(f => f.required).map(f => `${f.name}: $${f.name}`).join(', ');
  return `mutation Create${name}(${args}) {\n  create${name}(input: { ${vars} }) {\n    id\n    success\n  }\n}`;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

const api = {
  get: (url: string) => fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } }).then(r => r.json()),
  post: (url: string, body: any) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: JSON.stringify(body) }).then(r => r.json()),
  patch: (url: string, body: any) => fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: JSON.stringify(body) }).then(r => r.json()),
  del: (url: string) => fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } }).then(r => r.json()),
};

// ─── VisualCanvas ─────────────────────────────────────────────────────────────

function VisualCanvas({ type, templates, mappings, onMappingChange }: {
  type: MessageType | null;
  templates: Template[];
  mappings: VariableMapping[];
  onMappingChange: (m: VariableMapping[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number } | null>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [connectFrom, setConnectFrom] = useState<{ nodeId: string; field: string } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // Build initial nodes from type + mappings
  useEffect(() => {
    if (!type) { setNodes([]); setEdges([]); return; }
    const ns: CanvasNode[] = [
      { id: 'type', kind: 'type', x: 260, y: 60, label: type.name, color: NODE_COLORS.type, data: type },
      { id: 'output', kind: 'output', x: 540, y: 180, label: '📤 Lens Post', color: NODE_COLORS.output },
    ];
    SYSTEM_VARS.forEach((v, i) => {
      ns.push({ id: `sys_${i}`, kind: 'variable', x: 40, y: 60 + i * 60, label: v, color: NODE_COLORS.variable });
    });
    setNodes(ns);
    // Build edges from mappings
    const es: CanvasEdge[] = mappings
      .filter(m => m.source === 'system' && m.systemKey)
      .map(m => ({
        id: `${m.systemKey}_${m.fieldName}`,
        fromNode: `sys_${SYSTEM_VARS.indexOf(m.systemKey!)}`,
        toNode: 'type',
        fromField: m.systemKey,
        toField: m.fieldName,
        label: m.fieldName,
      }));
    setEdges(es);
  }, [type, mappings]);

  const getNode = (id: string) => nodes.find(n => n.id === id);

  const onMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const n = getNode(id);
    if (!n) return;
    setDragging({ id, ox: e.clientX - n.x, oy: e.clientY - n.y });
  };

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setNodes(prev => prev.map(n => n.id === dragging.id ? { ...n, x: e.clientX - dragging.ox, y: e.clientY - dragging.oy } : n));
  }, [dragging]);

  const onMouseUp = () => setDragging(null);

  const onFieldClick = (nodeId: string, field: string) => {
    if (!connectFrom) {
      setConnectFrom({ nodeId, field });
    } else {
      // Create edge + mapping
      const from = getNode(connectFrom.nodeId);
      const to = getNode(nodeId);
      if (from && to && connectFrom.nodeId !== nodeId) {
        const edgeId = `${connectFrom.nodeId}_${nodeId}_${Date.now()}`;
        setEdges(prev => [...prev, { id: edgeId, fromNode: connectFrom.nodeId, toNode: nodeId, fromField: connectFrom.field, toField: field }]);
        // Create mapping
        const newMapping: VariableMapping = {
          fieldName: to.kind === 'type' ? field : connectFrom.field,
          source: 'system',
          value: '',
          systemKey: from.kind === 'variable' ? from.label : connectFrom.field,
        };
        onMappingChange([...mappings.filter(m => m.fieldName !== newMapping.fieldName), newMapping]);
      }
      setConnectFrom(null);
    }
  };

  const removeEdge = (edgeId: string) => {
    const e = edges.find(x => x.id === edgeId);
    if (e) onMappingChange(mappings.filter(m => m.fieldName !== e.toField));
    setEdges(prev => prev.filter(x => x.id !== edgeId));
  };

  if (!type) return (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm">
      Select or create a type to open the visual canvas
    </div>
  );

  return (
    <div className="relative w-full h-full bg-[#0f172a] rounded-xl overflow-hidden select-none"
      onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      {/* Grid dots */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
        <defs>
          <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#94a3b8" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {/* Edges */}
      <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none">
        {edges.map(edge => {
          const from = getNode(edge.fromNode);
          const to = getNode(edge.toNode);
          if (!from || !to) return null;
          const x1 = from.x + 140, y1 = from.y + 30;
          const x2 = to.x, y2 = to.y + 30;
          const cx = (x1 + x2) / 2;
          return (
            <g key={edge.id}>
              <path d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
                stroke="#6366f1" strokeWidth="2" fill="none" strokeDasharray="6,3" opacity="0.8" />
              {edge.label && (
                <text x={cx} y={(y1 + y2) / 2 - 6} fill="#a5b4fc" fontSize="10" textAnchor="middle">{edge.label}</text>
              )}
              <circle cx={cx} cy={(y1 + y2) / 2} r="6" fill="#1e1b4b" stroke="#6366f1" strokeWidth="1.5"
                className="pointer-events-auto cursor-pointer"
                onClick={() => removeEdge(edge.id)} />
              <text x={cx} y={(y1 + y2) / 2 + 4} fill="#ef4444" fontSize="9" textAnchor="middle"
                className="pointer-events-none">✕</text>
            </g>
          );
        })}
        {/* Live connection line */}
        {connectFrom && (() => {
          const fn = getNode(connectFrom.nodeId);
          if (!fn) return null;
          return <circle cx={fn.x + 140} cy={fn.y + 30} r="5" fill="#f59e0b" className="animate-pulse" />;
        })()}
      </svg>

      {/* Nodes */}
      {nodes.map(node => (
        <div key={node.id}
          className="absolute rounded-xl border shadow-xl cursor-move"
          style={{ left: node.x, top: node.y, minWidth: 150, borderColor: node.color, background: '#1e293b', zIndex: dragging?.id === node.id ? 10 : 1 }}
          onMouseDown={e => onMouseDown(e, node.id)}>
          {/* Header */}
          <div className="rounded-t-xl px-3 py-2 flex items-center gap-2"
            style={{ background: node.color + '33', borderBottom: `1px solid ${node.color}44` }}>
            <span className="w-2 h-2 rounded-full" style={{ background: node.color }} />
            <span className="text-xs font-bold text-white">{node.label}</span>
            {node.kind === 'type' && badge('TYPE', 'bg-indigo-900 text-indigo-300')}
            {node.kind === 'variable' && badge('VAR', 'bg-emerald-900 text-emerald-300')}
            {node.kind === 'output' && badge('OUT', 'bg-amber-900 text-amber-300')}
          </div>
          {/* Fields */}
          {node.kind === 'type' && node.data?.fields?.map((f: Field) => (
            <div key={f.name}
              className={`flex items-center justify-between px-3 py-1.5 text-xs border-b border-slate-700 cursor-pointer hover:bg-indigo-900/30 transition-colors ${connectFrom ? 'ring-1 ring-indigo-400/50' : ''}`}
              onClick={e => { e.stopPropagation(); onFieldClick(node.id, f.name); }}>
              <span className="text-slate-200">{f.name}</span>
              <span className={`font-mono ${typeColor(f.type)}`}>{f.type}{f.required ? '!' : ''}</span>
            </div>
          ))}
          {node.kind === 'variable' && (
            <div className="px-3 py-1.5 text-[10px] text-emerald-400 font-mono cursor-pointer hover:bg-emerald-900/30"
              onClick={e => { e.stopPropagation(); onFieldClick(node.id, node.label); }}>
              {node.label} →
            </div>
          )}
          {node.kind === 'output' && (
            <div className="px-3 py-2 text-[10px] text-amber-300 space-y-1">
              <div>🌿 Lens Protocol</div>
              <div className="text-slate-400">{type?.lens_metadata_type || 'POST'}</div>
            </div>
          )}
        </div>
      ))}

      {/* Hint */}
      <div className="absolute bottom-3 left-3 text-[10px] text-slate-500 pointer-events-none">
        {connectFrom ? '🔗 Click a field to connect • ESC to cancel' : 'Click a field/var to start connecting • Drag nodes • Click ✕ on edge to remove'}
      </div>
      {connectFrom && (
        <button className="absolute bottom-3 right-3 text-[10px] text-slate-400 hover:text-white bg-slate-800 rounded px-2 py-1"
          onClick={() => setConnectFrom(null)}>ESC</button>
      )}
    </div>
  );
}

// ─── PostExecutor ─────────────────────────────────────────────────────────────

function PostExecutor({ type, mappings }: { type: MessageType | null; mappings: VariableMapping[] }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'simulate' | 'live'>('simulate');

  useEffect(() => { setValues({}); setResult(null); setError(''); }, [type]);

  const userFields = type?.fields.filter(f => !mappings.some(m => m.fieldName === f.name && m.source === 'system')) || [];

  const buildPayload = () => {
    const vars: Record<string, any> = {};
    mappings.forEach(m => {
      vars[m.fieldName] = m.source === 'static' ? m.value : m.source === 'system' ? `{{${m.systemKey}}}` : values[m.fieldName] || '';
    });
    userFields.forEach(f => { vars[f.name] = values[f.name] || ''; });
    return vars;
  };

  const execute = async () => {
    if (!type) return;
    setRunning(true); setError(''); setResult(null);
    try {
      const payload = {
        type_id: type.id,
        variables: buildPayload(),
        mode,
        lens_metadata_type: type.lens_metadata_type || 'POST',
      };
      const res = await api.post('/api/admin/graphql/execute', payload);
      setResult(res);
    } catch (e: any) {
      setError(e.message || 'Execution failed');
    } finally {
      setRunning(false);
    }
  };

  if (!type) return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Select a type to execute</div>;

  return (
    <div className="flex flex-col h-full gap-4 overflow-y-auto p-1">
      {/* Mode toggle */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mode</span>
        {(['simulate', 'live'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${mode === m ? m === 'live' ? 'bg-rose-500 text-white' : 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {m === 'simulate' ? '🧪 Simulate' : '🚀 Post Live'}
          </button>
        ))}
        {mode === 'live' && <span className="text-xs text-rose-600 font-semibold">⚠ Will post to Lens Protocol</span>}
      </div>

      {/* Variable inputs */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
          Variables
        </div>
        <div className="divide-y divide-slate-100">
          {/* System-mapped fields (read-only) */}
          {mappings.filter(m => m.source === 'system').map(m => (
            <div key={m.fieldName} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-28 text-xs font-medium text-slate-700 shrink-0">{m.fieldName}</span>
              <span className="flex-1 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-mono text-emerald-700">
                {`{{${m.systemKey}}}`}
              </span>
              {badge('auto', 'bg-emerald-100 text-emerald-700')}
            </div>
          ))}
          {/* Static fields */}
          {mappings.filter(m => m.source === 'static').map(m => (
            <div key={m.fieldName} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-28 text-xs font-medium text-slate-700 shrink-0">{m.fieldName}</span>
              <input value={values[m.fieldName] ?? m.value} onChange={e => setValues(v => ({ ...v, [m.fieldName]: e.target.value }))}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              {badge('static', 'bg-slate-100 text-slate-600')}
            </div>
          ))}
          {/* User-provided fields */}
          {userFields.map(f => (
            <div key={f.name} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-28 text-xs font-medium text-slate-700 shrink-0">{f.name}</span>
              <input placeholder={`Enter ${f.name}…`} value={values[f.name] || ''} onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <span className={`text-[10px] font-mono ${typeColor(f.type)}`}>{f.type}{f.required ? '!' : ''}</span>
            </div>
          ))}
          {type.fields.length === 0 && <div className="px-4 py-3 text-xs text-slate-400">No fields defined</div>}
        </div>
      </div>

      {/* Preview payload */}
      <details className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <summary className="px-4 py-2.5 text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-50 flex items-center gap-2">
          <span>📋</span> Preview Payload
        </summary>
        <pre className="px-4 pb-4 text-[10px] font-mono text-slate-700 overflow-auto max-h-40 bg-slate-50">
          {JSON.stringify({ type: type.name, lens_metadata_type: type.lens_metadata_type, variables: buildPayload() }, null, 2)}
        </pre>
      </details>

      {/* Execute */}
      <button onClick={execute} disabled={running}
        className={`rounded-xl px-6 py-3 text-sm font-bold text-white transition-all disabled:opacity-50 ${mode === 'live' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
        {running ? '⏳ Executing…' : mode === 'simulate' ? '🧪 Simulate Post' : '🚀 Post to Lens'}
      </button>

      {/* Result */}
      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-700">{error}</div>}
      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden">
          <div className="px-4 py-2.5 bg-emerald-100 text-xs font-semibold text-emerald-700 flex items-center gap-2">
            <span>✅</span> {result.success === false ? 'Error' : 'Success'}
            {result.tx_hash && <span className="font-mono text-emerald-600 ml-auto">{result.tx_hash.slice(0, 16)}…</span>}
          </div>
          <pre className="px-4 py-3 text-[10px] font-mono text-emerald-800 overflow-auto max-h-48">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── TypeEditor ──────────────────────────────────────────────────────────────

function TypeEditor({ type, onSave, onDelete, onClose }: {
  type: MessageType | null;
  onSave: (data: Partial<MessageType>) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const isNew = !type?.id;
  const [form, setForm] = useState({
    name: type?.name || '',
    description: type?.description || '',
    lens_metadata_type: type?.lens_metadata_type || 'POST',
    fields: type?.fields ? [...type.fields] : [] as Field[],
    query_template: type?.query_template || '',
    mutation_template: type?.mutation_template || '',
  });
  const [newField, setNewField] = useState<Field>({ name: '', type: 'String', required: false, description: '' });
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Auto-generate type_definition
  const typeDef = useMemo(() => buildTypeDefinition(form.name || 'NewType', form.fields), [form.name, form.fields]);
  const mutationDef = useMemo(() => buildMutationTemplate(form.name || 'NewType', form.fields), [form.name, form.fields]);

  const addField = () => {
    if (!newField.name.trim()) return;
    setForm(f => ({ ...f, fields: [...f.fields, { ...newField }] }));
    setNewField({ name: '', type: 'String', required: false, description: '' });
  };

  const updateField = (i: number, patch: Partial<Field>) => {
    setForm(f => ({ ...f, fields: f.fields.map((x, idx) => idx === i ? { ...x, ...patch } : x) }));
  };

  const removeField = (i: number) => {
    setForm(f => ({ ...f, fields: f.fields.filter((_, idx) => idx !== i) }));
  };

  // Drag to reorder
  const onDragStart = (i: number) => setDragIdx(i);
  const onDragEnter = (i: number) => setDragOver(i);
  const onDrop = () => {
    if (dragIdx === null || dragOver === null || dragIdx === dragOver) { setDragIdx(null); setDragOver(null); return; }
    const fields = [...form.fields];
    const [moved] = fields.splice(dragIdx, 1);
    fields.splice(dragOver, 0, moved);
    setForm(f => ({ ...f, fields }));
    setDragIdx(null); setDragOver(null);
  };

  const handleSave = () => {
    onSave({ ...form, type_definition: typeDef, mutation_template: mutationDef });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg">📐</span>
          <span className="font-bold text-slate-900">{isNew ? 'New Type' : `Edit · ${type?.name}`}</span>
          {type?.is_system && badge('SYSTEM', 'bg-slate-200 text-slate-600')}
        </div>
        <div className="flex items-center gap-2">
          {!type?.is_system && !isNew && onDelete && (
            <button onClick={onDelete} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors">🗑 Delete</button>
          )}
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
          <button onClick={handleSave} disabled={!form.name || type?.is_system}
            className="rounded-lg px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {isNew ? '✚ Create' : '💾 Save'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-0 h-full">
          {/* Left: form */}
          <div className="px-5 py-4 space-y-4 border-r border-slate-200 overflow-y-auto">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Type Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                disabled={type?.is_system}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
                placeholder="e.g. OnTrailPOI" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="What does this type represent?" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Lens Metadata Type</label>
              <select value={form.lens_metadata_type} onChange={e => setForm(f => ({ ...f, lens_metadata_type: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                {LENS_META_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Fields table */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Fields</label>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[1fr_100px_60px_32px] gap-0 bg-slate-50 border-b border-slate-200 px-3 py-2">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Name</span>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Type</span>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Req</span>
                  <span />
                </div>
                {form.fields.map((f, i) => (
                  <div key={i}
                    draggable onDragStart={() => onDragStart(i)} onDragEnter={() => onDragEnter(i)} onDragEnd={onDrop}
                    className={`grid grid-cols-[1fr_100px_60px_32px] gap-0 items-center border-b border-slate-100 px-3 py-1.5 cursor-grab hover:bg-indigo-50/50 transition-colors ${dragOver === i ? 'bg-indigo-100' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-300 text-xs">⠿</span>
                      <input value={f.name} onChange={e => updateField(i, { name: e.target.value })}
                        className="w-full text-xs font-mono bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1" />
                    </div>
                    <select value={f.type} onChange={e => updateField(i, { type: e.target.value })}
                      className={`text-xs font-mono bg-transparent focus:outline-none ${typeColor(f.type)}`}>
                      {GQL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <div className="flex justify-center">
                      <input type="checkbox" checked={f.required} onChange={e => updateField(i, { required: e.target.checked })}
                        className="accent-indigo-500" />
                    </div>
                    <button onClick={() => removeField(i)} className="text-rose-400 hover:text-rose-600 text-xs">✕</button>
                  </div>
                ))}
                {/* Add row */}
                <div className="grid grid-cols-[1fr_100px_60px_32px] gap-0 items-center px-3 py-2 bg-slate-50/50">
                  <input value={newField.name} onChange={e => setNewField(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addField()}
                    placeholder="field name…" className="text-xs font-mono rounded-lg border border-dashed border-slate-300 px-2 py-1 focus:outline-none focus:border-indigo-400" />
                  <select value={newField.type} onChange={e => setNewField(f => ({ ...f, type: e.target.value }))}
                    className={`text-xs font-mono bg-transparent focus:outline-none ml-1 ${typeColor(newField.type)}`}>
                    {GQL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="flex justify-center">
                    <input type="checkbox" checked={newField.required} onChange={e => setNewField(f => ({ ...f, required: e.target.checked }))}
                      className="accent-indigo-500" />
                  </div>
                  <button onClick={addField} className="text-emerald-500 hover:text-emerald-700 text-sm font-bold">+</button>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Drag rows to reorder • Enter to add field</p>
            </div>
          </div>

          {/* Right: live preview */}
          <div className="px-5 py-4 space-y-4 bg-[#0f172a] overflow-y-auto">
            <div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">GraphQL Type Definition</div>
              <pre className="rounded-xl bg-[#1e293b] border border-slate-700 px-4 py-3 text-xs font-mono text-emerald-300 overflow-auto leading-relaxed whitespace-pre-wrap">
                {typeDef}
              </pre>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Generated Mutation</div>
              <pre className="rounded-xl bg-[#1e293b] border border-slate-700 px-4 py-3 text-xs font-mono text-sky-300 overflow-auto leading-relaxed whitespace-pre-wrap">
                {mutationDef}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TemplateEditor ───────────────────────────────────────────────────────────

function TemplateEditor({ template, types, onSave, onDelete, onClose }: {
  template: Template | null;
  types: MessageType[];
  onSave: (data: any) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const isNew = !template?.id;
  const [form, setForm] = useState({
    template_name: template?.template_name || '',
    message_type_id: template?.message_type_id || types[0]?.id || '',
    template_content: template?.template_content || '',
    variables_schema: template?.variables_schema ? JSON.stringify(template.variables_schema, null, 2) : '{}',
  });

  const selectedType = types.find(t => t.id === form.message_type_id);

  const insertVariable = (varName: string) => {
    setForm(f => ({ ...f, template_content: f.template_content + `{{${varName}}}` }));
  };

  const handleSave = () => {
    try {
      onSave({ ...form, variables_schema: JSON.parse(form.variables_schema) });
    } catch { onSave({ ...form, variables_schema: {} }); }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg">📝</span>
          <span className="font-bold text-slate-900">{isNew ? 'New Template' : `Edit · ${template?.template_name}`}</span>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && onDelete && (
            <button onClick={onDelete} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">🗑 Delete</button>
          )}
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
          <button onClick={handleSave} disabled={!form.template_name || !form.template_content}
            className="rounded-lg px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
            {isNew ? '✚ Create' : '💾 Save'}
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[280px_1fr] overflow-hidden">
        {/* Sidebar */}
        <div className="border-r border-slate-200 px-4 py-4 space-y-4 overflow-y-auto bg-slate-50">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Template Name</label>
            <input value={form.template_name} onChange={e => setForm(f => ({ ...f, template_name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="e.g. TrailCheckIn" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Message Type</label>
            <select value={form.message_type_id} onChange={e => setForm(f => ({ ...f, message_type_id: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Variables palette */}
          {selectedType && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Insert Variable</div>
              <div className="space-y-1">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Type fields</div>
                {selectedType.fields.map(f => (
                  <button key={f.name} onClick={() => insertVariable(f.name)}
                    className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-indigo-50 text-slate-700 transition-colors border border-transparent hover:border-indigo-200">
                    <span className="font-mono">{`{{${f.name}}}`}</span>
                    <span className={`text-[10px] ${typeColor(f.type)}`}>{f.type}</span>
                  </button>
                ))}
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-2 mb-1">System</div>
                {SYSTEM_VARS.map(v => (
                  <button key={v} onClick={() => insertVariable(v)}
                    className="w-full flex items-center rounded-lg px-2.5 py-1.5 text-xs hover:bg-emerald-50 text-slate-700 transition-colors border border-transparent hover:border-emerald-200">
                    <span className="font-mono text-emerald-700">{`{{${v}}}`}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Template Content</span>
            <span className="text-[10px] text-slate-400">Use {'{{variable}}'} syntax</span>
          </div>
          <textarea value={form.template_content} onChange={e => setForm(f => ({ ...f, template_content: e.target.value }))}
            className="flex-1 resize-none font-mono text-xs px-5 py-4 focus:outline-none bg-[#0f172a] text-emerald-300 leading-relaxed"
            placeholder={`{\n  "title": "{{trail.name}}",\n  "content": "Checked in at {{poi.id}}",\n  "tags": ["ontrail"]\n}`} />
          {/* Preview */}
          <div className="px-5 py-3 border-t border-slate-700 bg-[#1e293b]">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Live Preview (with sample values)</div>
            <pre className="text-[10px] font-mono text-amber-300 max-h-24 overflow-auto">
              {form.template_content
                .replace(/\{\{(\w+\.\w+)\}\}/g, (_, k) => `"<${k}>"`)
                .replace(/\{\{(\w+)\}\}/g, (_, k) => `"<${k}>"`) || '…'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Panel view IDs ──────────────────────────────────────────────────────────
type PanelView = 'list' | 'type-editor' | 'canvas' | 'execute' | 'template-editor';

export default function GraphQLDesignerPage() {
  const [panel, setPanel] = useState<PanelView>('list');
  const [listTab, setListTab] = useState<'types' | 'templates'>('types');
  const [messageTypes, setMessageTypes] = useState<MessageType[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<MessageType | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [mappings, setMappings] = useState<VariableMapping[]>([]);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [types, tmpls] = await Promise.all([
        api.get('/api/admin/graphql/types'),
        api.get('/api/admin/graphql/templates'),
      ]);
      setMessageTypes(Array.isArray(types) ? types : []);
      setTemplates(Array.isArray(tmpls) ? tmpls : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openTypeEditor = (t: MessageType | null) => { setActiveType(t); setPanel('type-editor'); };
  const openCanvas = (t: MessageType) => { setActiveType(t); setMappings([]); setPanel('canvas'); };
  const openExecute = (t: MessageType) => { setActiveType(t); setPanel('execute'); };
  const openTemplateEditor = (t: Template | null) => { setActiveTemplate(t); setPanel('template-editor'); };

  const handleSaveType = async (data: Partial<MessageType>) => {
    try {
      if (activeType?.id) {
        await api.patch(`/api/admin/graphql/types/${activeType.id}`, data);
        showToast('✅ Type updated');
      } else {
        await api.post('/api/admin/graphql/types', data);
        showToast('✅ Type created');
      }
      await load();
      setPanel('list');
    } catch (e: any) { showToast('❌ ' + (e.message || 'Save failed')); }
  };

  const handleDeleteType = async () => {
    if (!activeType?.id || !confirm(`Delete "${activeType.name}"?`)) return;
    try {
      await api.del(`/api/admin/graphql/types/${activeType.id}`);
      showToast('🗑 Deleted');
      await load();
      setPanel('list');
    } catch (e: any) { showToast('❌ ' + (e.message || 'Delete failed')); }
  };

  const handleSaveTemplate = async (data: any) => {
    try {
      if (activeTemplate?.id) {
        await api.patch(`/api/admin/graphql/templates/${activeTemplate.id}`, data);
        showToast('✅ Template updated');
      } else {
        await api.post('/api/admin/graphql/templates', data);
        showToast('✅ Template created');
      }
      await load();
      setPanel('list');
    } catch (e: any) { showToast('❌ ' + (e.message || 'Save failed')); }
  };

  const handleDeleteTemplate = async () => {
    if (!activeTemplate?.id || !confirm(`Delete "${activeTemplate.template_name}"?`)) return;
    try {
      await api.del(`/api/admin/graphql/templates/${activeTemplate.id}`);
      showToast('🗑 Deleted');
      await load();
      setPanel('list');
    } catch (e: any) { showToast('❌ ' + (e.message || 'Delete failed')); }
  };

  const handleSeedSystemTypes = async () => {
    try {
      const r = await api.post('/api/admin/graphql/seed-system-types', {});
      showToast('✅ ' + (r.message || 'Seeded'));
      await load();
    } catch (e: any) { showToast('❌ ' + (e.message || 'Seed failed')); }
  };

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 shrink-0">
        <span className="text-base">🔷</span>
        <span className="font-bold text-slate-900 text-sm">GraphQL Designer</span>
        <span className="text-slate-300">|</span>

        {/* Breadcrumb */}
        <button onClick={() => setPanel('list')}
          className={`text-xs font-medium transition-colors ${panel === 'list' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-700'}`}>
          Library
        </button>
        {(panel === 'type-editor' || panel === 'canvas' || panel === 'execute') && activeType && (
          <>
            <span className="text-slate-300 text-xs">›</span>
            <span className="text-xs font-medium text-slate-700">{activeType.name || 'New Type'}</span>
          </>
        )}
        {panel === 'template-editor' && (
          <>
            <span className="text-slate-300 text-xs">›</span>
            <span className="text-xs font-medium text-slate-700">{activeTemplate?.template_name || 'New Template'}</span>
          </>
        )}

        {/* Sub-view tabs when in type context */}
        {activeType && ['type-editor', 'canvas', 'execute'].includes(panel) && (
          <div className="ml-auto flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {([['type-editor', '📐 Edit'], ['canvas', '🎨 Canvas'], ['execute', '🚀 Execute']] as const).map(([p, label]) => (
              <button key={p} onClick={() => setPanel(p as PanelView)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${panel === p ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className={`${activeType && ['type-editor', 'canvas', 'execute'].includes(panel) ? '' : 'ml-auto'} flex items-center gap-2`}>
          {panel === 'list' && (
            <>
              <button onClick={handleSeedSystemTypes}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                🌱 Seed System Types
              </button>
              <button onClick={() => openTemplateEditor(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors">
                + Template
              </button>
              <button onClick={() => openTypeEditor(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                + New Type
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">

        {/* LIST VIEW */}
        {panel === 'list' && (
          <div className="flex h-full overflow-hidden">
            {/* Sidebar tabs */}
            <div className="w-40 border-r border-slate-200 bg-white flex flex-col gap-1 pt-3 px-2 shrink-0">
              {([['types', '📐 Types'], ['templates', '📝 Templates']] as const).map(([t, label]) => (
                <button key={t} onClick={() => setListTab(t)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold text-left transition-all ${listTab === t ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* List content */}
            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading…</div>
              ) : listTab === 'types' ? (
                <div className="space-y-2">
                  {messageTypes.length === 0 && (
                    <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-400 text-sm">
                      No types yet — click <strong>+ New Type</strong> or <strong>🌱 Seed System Types</strong>
                    </div>
                  )}
                  {messageTypes.map(t => (
                    <div key={t.id}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-4 hover:border-indigo-300 hover:shadow-sm transition-all group">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0"
                        style={{ background: NODE_COLORS.type + '22', color: NODE_COLORS.type }}>
                        {t.is_system ? '⚙' : '📐'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-900 font-mono">{t.name}</span>
                          {t.is_system && badge('SYSTEM', 'bg-slate-100 text-slate-500')}
                          {t.lens_metadata_type && badge(t.lens_metadata_type, 'bg-indigo-100 text-indigo-700')}
                          {!t.is_active && badge('inactive', 'bg-rose-100 text-rose-600')}
                        </div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">{t.description || 'No description'}</div>
                        <div className="text-[10px] text-slate-400 mt-1">{t.fields?.length || 0} fields</div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openCanvas(t)}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors">🎨</button>
                        <button onClick={() => openExecute(t)}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors">🚀</button>
                        <button onClick={() => openTypeEditor(t)}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors">Edit</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.length === 0 && (
                    <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-400 text-sm">
                      No templates yet — click <strong>+ Template</strong>
                    </div>
                  )}
                  {templates.map(t => {
                    const typeName = messageTypes.find(mt => mt.id === t.message_type_id)?.name || t.message_type_id.slice(0, 8);
                    return (
                      <div key={t.id}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 bg-amber-50 text-amber-600">📝</div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-slate-900">{t.template_name}</span>
                              {badge(typeName, 'bg-indigo-100 text-indigo-700')}
                              <span className="text-[10px] text-slate-400 ml-auto">used {t.usage_count}×</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openTemplateEditor(t)}
                              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">Edit</button>
                          </div>
                        </div>
                        <pre className="rounded-xl bg-[#0f172a] text-emerald-300 text-[10px] font-mono px-3 py-2 overflow-auto max-h-20 leading-relaxed">
                          {t.template_content.slice(0, 200)}{t.template_content.length > 200 ? '…' : ''}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TYPE EDITOR */}
        {panel === 'type-editor' && (
          <TypeEditor
            type={activeType}
            onSave={handleSaveType}
            onDelete={handleDeleteType}
            onClose={() => setPanel('list')}
          />
        )}

        {/* CANVAS */}
        {panel === 'canvas' && (
          <div className="flex h-full overflow-hidden">
            <div className="flex-1 p-4 overflow-hidden">
              <VisualCanvas
                type={activeType}
                templates={templates}
                mappings={mappings}
                onMappingChange={setMappings}
              />
            </div>
            {/* Mapping sidebar */}
            <div className="w-72 border-l border-slate-200 bg-white overflow-y-auto p-4 shrink-0">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Mappings</div>
              {mappings.length === 0 && (
                <div className="text-xs text-slate-400 text-center py-8">Click a variable node field → type field to map them</div>
              )}
              {mappings.map((m, i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 mb-2 flex items-center gap-2 text-xs">
                  <span className="font-mono text-emerald-700 flex-1">{m.fieldName}</span>
                  <span className="text-slate-400">←</span>
                  <span className="font-mono text-indigo-600">{m.systemKey || m.value}</span>
                  <button onClick={() => setMappings(prev => prev.filter((_, j) => j !== i))}
                    className="text-rose-400 hover:text-rose-600 ml-1">✕</button>
                </div>
              ))}
              {mappings.length > 0 && (
                <button onClick={() => openExecute(activeType!)}
                  className="w-full mt-4 rounded-xl bg-indigo-600 text-white text-xs font-semibold py-2.5 hover:bg-indigo-700 transition-colors">
                  → Execute with these mappings
                </button>
              )}
            </div>
          </div>
        )}

        {/* EXECUTE */}
        {panel === 'execute' && (
          <div className="p-5 h-full overflow-y-auto">
            <PostExecutor type={activeType} mappings={mappings} />
          </div>
        )}

        {/* TEMPLATE EDITOR */}
        {panel === 'template-editor' && (
          <TemplateEditor
            template={activeTemplate}
            types={messageTypes}
            onSave={handleSaveTemplate}
            onDelete={handleDeleteTemplate}
            onClose={() => setPanel('list')}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 rounded-2xl bg-slate-900 text-white text-xs font-semibold px-5 py-3 shadow-2xl z-50 animate-bounce-once">
          {toast}
        </div>
      )}
    </div>
  );
}
