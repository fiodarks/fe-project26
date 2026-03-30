import type { HierarchyNode } from '../../api/types'

type FlatNode = {
  id: string
  name: string
  level: number
  depth: number
}

function flatten(node: HierarchyNode, depth = 0, out: FlatNode[] = []): FlatNode[] {
  out.push({ id: node.id, name: node.name, level: node.level, depth })
  for (const child of node.children ?? []) flatten(child, depth + 1, out)
  return out
}

export function HierarchyPicker({
  root,
  selectedId,
  onSelect,
  label = 'Hierarchy',
  emptyLabel = 'All levels',
  hint = 'Used for hierarchical browsing (viewer) and assignment during upload (creator).',
}: {
  root: HierarchyNode | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  label?: string
  emptyLabel?: string
  hint?: string
}) {
  if (!root) return <div style={{ color: 'var(--muted)' }}>Hierarchy not loaded</div>

  const nodes = flatten(root)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontWeight: 650 }}>{label}</label>
      <select
        className="select"
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value ? e.target.value : null)}
      >
        <option value="">{emptyLabel}</option>
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {'· '.repeat(Math.min(6, n.depth))}
            {n.name}
          </option>
        ))}
      </select>
      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
        {hint}
      </div>
    </div>
  )
}
