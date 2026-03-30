import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { HierarchyViewportTreeNode } from '../../api/types'

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

function buildIndex(root: HierarchyViewportTreeNode) {
  const byId = new Map<string, HierarchyViewportTreeNode>()
  const childIdsById = new Map<string, string[]>()
  const subtreeIdsById = new Map<string, string[]>()
  const orderIndexById = new Map<string, number>()

  const stack: HierarchyViewportTreeNode[] = [root]
  while (stack.length) {
    const node = stack.pop()
    if (!node) continue
    byId.set(node.id, node)
    const childIds = (node.children ?? []).map((c) => c.id)
    childIdsById.set(node.id, childIds)
    for (const child of node.children ?? []) stack.push(child)
  }

  let seq = 0
  const walkOrder = (node: HierarchyViewportTreeNode) => {
    orderIndexById.set(node.id, seq++)
    for (const child of node.children ?? []) walkOrder(child)
  }
  walkOrder(root)

  const buildSubtree = (node: HierarchyViewportTreeNode): string[] => {
    const out: string[] = [node.id]
    for (const child of node.children ?? []) out.push(...buildSubtree(child))
    subtreeIdsById.set(node.id, out)
    return out
  }
  buildSubtree(root)

  return { byId, childIdsById, subtreeIdsById, orderIndexById }
}

function shouldHideNode(node: HierarchyViewportTreeNode): boolean {
  return node.level === 'root' || normalize(node.name) === 'archive'
}

export function HierarchyViewportPicker({
  root,
  selectedIds,
  onChange,
  label = 'Hierarchy',
  emptyLabel = 'All levels',
  hint,
  loading = false,
}: {
  root: HierarchyViewportTreeNode | null
  selectedIds: string[]
  onChange: (ids: string[]) => void
  label?: string
  emptyLabel?: string
  hint?: string
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const index = useMemo(
    () =>
      root
        ? buildIndex(root)
        : {
            byId: new Map<string, HierarchyViewportTreeNode>(),
            childIdsById: new Map<string, string[]>(),
            subtreeIdsById: new Map<string, string[]>(),
            orderIndexById: new Map<string, number>(),
          },
    [root],
  )
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const triggerLabel = useMemo(() => {
    if (!root) return emptyLabel
    if (!selectedIds.length) return emptyLabel
    if (selectedIds.length === 1) {
      const node = index.byId.get(selectedIds[0])
      return node?.name ?? '1 selected'
    }
    const first = index.byId.get(selectedIds[0])?.name
    return first ? `${first} +${selectedIds.length - 1}` : `${selectedIds.length} selected`
  }, [emptyLabel, index.byId, root, selectedIds])

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      const el = wrapperRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  if (loading) {
    return <div style={{ color: 'var(--muted)' }}>Hierarchy loading…</div>
  }

  if (!root) {
    return <div style={{ color: 'var(--muted)' }}>Hierarchy not loaded</div>
  }

  const normalizeSelection = (input: Set<string>) => {
    // If any selected parent is missing a descendant, drop the parent from selection
    // to avoid accidentally filtering by an overly-broad node.
    for (const id of Array.from(input)) {
      const node = index.byId.get(id)
      if (!node) {
        input.delete(id)
        continue
      }
      const subtree = index.subtreeIdsById.get(id) ?? [id]
      const all = subtree.every((sid) => input.has(sid))
      if (!all) input.delete(id)
    }
  }

  const orderedIds = (input: Set<string>) => {
    return Array.from(input).sort((a, b) => {
      const ai = index.orderIndexById.get(a) ?? Number.MAX_SAFE_INTEGER
      const bi = index.orderIndexById.get(b) ?? Number.MAX_SAFE_INTEGER
      return ai - bi
    })
  }

  const toggleNode = (nodeId: string, nextChecked: boolean) => {
    const subtree = index.subtreeIdsById.get(nodeId) ?? [nodeId]
    const next = new Set(selectedSet)
    if (nextChecked) for (const id of subtree) next.add(id)
    else for (const id of subtree) next.delete(id)
    normalizeSelection(next)
    onChange(orderedIds(next))
  }

  const renderNode = (node: HierarchyViewportTreeNode, depth: number): ReactNode => {
    if (shouldHideNode(node)) {
      return (node.children ?? []).map((c) => renderNode(c, depth))
    }

    const subtree = index.subtreeIdsById.get(node.id) ?? [node.id]
    const allSelected = subtree.every((id) => selectedSet.has(id))
    const someSelected = subtree.some((id) => selectedSet.has(id))
    const checked = selectedSet.has(node.id) && allSelected
    const indeterminate = !checked && someSelected

    return (
      <div key={node.id}>
        <label className="hierTreeRow" style={{ paddingLeft: 6 + depth * 14 }}>
          <input
            type="checkbox"
            checked={checked}
            ref={(el) => {
              if (el) el.indeterminate = indeterminate
            }}
            onChange={(e) => toggleNode(node.id, e.target.checked)}
          />
          <span className="hierTreeName" title={node.name}>
            {node.name}
          </span>
          <span className="hierTreeLevel" title={node.level}>
            {node.level}
          </span>
        </label>
        {(node.children ?? []).map((c) => renderNode(c, depth + 1))}
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="hierDrop" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontWeight: 650 }}>{label}</label>

      <button
        type="button"
        className="select hierDropTrigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={triggerLabel}
      >
        <span className="hierDropTriggerLabel">{triggerLabel}</span>
        <span className="hierDropCaret" aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div className="hierDropPanel" role="dialog" aria-label="Hierarchy filter">
          <div className="hierDropPanelTop">
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              Select one or more levels
            </div>
            {selectedIds.length ? (
              <button
                type="button"
                className="btn hierDropClear"
                onClick={() => onChange([])}
              >
                {emptyLabel}
              </button>
            ) : null}
          </div>

          <div className="hierDropList">
            {(root.children ?? []).length ? (
              root.children.map((n) => renderNode(n, 0))
            ) : (
              <div className="hierSimpleEmpty">No items</div>
            )}
          </div>
        </div>
      ) : null}

      {hint ? (
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}
