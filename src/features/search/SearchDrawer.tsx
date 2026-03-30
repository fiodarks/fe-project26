import { type CSSProperties, useState } from 'react'
import type { HierarchyNode, MaterialDTO, MaterialListResponse } from '../../api/types'
import { HierarchyPicker } from '../hierarchy/HierarchyPicker'
import { predefinedMetadataKeys } from './predefinedMetadata'

const partialDateRe = /^\d{4}(-\d{2}(-\d{2})?)?$/

export type SearchFormState = {
  search: string
  location: string
  dateFrom: string
  dateTo: string
  hierarchyLevelId: string | null
  useMapBounds: boolean
  metadata: { key: string; value: string }[]
}

export function SearchDrawer({
  open,
  hierarchyRoot,
  bbox,
  state,
  onState,
  results,
  loading,
  error,
  onSearch,
  onSelectMaterial,
  onClose,
}: {
  open: boolean
  hierarchyRoot: HierarchyNode | null
  bbox: [number, number, number, number] | null
  state: SearchFormState
  onState: (s: SearchFormState) => void
  results: MaterialListResponse | null
  loading: boolean
  error: string | null
  onSearch: () => void
  onSelectMaterial: (id: string) => void
  onClose: () => void
}) {
  const [validation, setValidation] = useState<string | null>(null)

  if (!open) return null

  const validate = (): boolean => {
    if (state.dateFrom && !partialDateRe.test(state.dateFrom)) {
      setValidation('Date from must be YYYY, YYYY-MM, or YYYY-MM-DD.')
      return false
    }
    if (state.dateTo && !partialDateRe.test(state.dateTo)) {
      setValidation('Date to must be YYYY, YYYY-MM, or YYYY-MM-DD.')
      return false
    }
    setValidation(null)
    return true
  }

  const resultItems = results?.data ?? []
  const metadataItems = state.metadata ?? []

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <button className="btn btnPrimary" onClick={() => (validate() ? onSearch() : null)} disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
          <button className="btn" onClick={onClose}>
            Hide
          </button>
        </div>

        {validation && (
          <div style={{ border: '1px solid var(--border)', padding: 10, borderRadius: 10, color: 'var(--danger)' }}>
            {validation}
          </div>
        )}
        {error && (
          <div style={{ border: '1px solid var(--border)', padding: 10, borderRadius: 10, color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 650 }}>Search phrase</span>
            <input
              value={state.search}
              onChange={(e) => onState({ ...state, search: e.target.value })}
              placeholder="e.g. school, market, bridge…"
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 650 }}>Location (text)</span>
            <input
              value={state.location}
              onChange={(e) => onState({ ...state, location: e.target.value })}
              placeholder="e.g. district / street / place name…"
              style={inputStyle}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 650 }}>Date from</span>
              <input
                value={state.dateFrom}
                onChange={(e) => onState({ ...state, dateFrom: e.target.value })}
                placeholder="YYYY or YYYY-MM or YYYY-MM-DD"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 650 }}>Date to</span>
              <input
                value={state.dateTo}
                onChange={(e) => onState({ ...state, dateTo: e.target.value })}
                placeholder="YYYY or YYYY-MM or YYYY-MM-DD"
                style={inputStyle}
              />
            </label>
          </div>

          <HierarchyPicker
            root={hierarchyRoot}
            selectedId={state.hierarchyLevelId}
            onSelect={(id) => onState({ ...state, hierarchyLevelId: id })}
          />

          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 12,
              background: 'var(--surface)',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 650 }}>Metadata filters</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              All filters must match. Uses predefined keys (type to pick one).
            </div>

            <datalist id="metadataKeys">
              {predefinedMetadataKeys.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>

            {metadataItems.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>No metadata filters.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {metadataItems.map((kv, idx) => (
                  <div
                    key={idx}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}
                  >
                    <input
                      value={kv.key}
                      list="metadataKeys"
                      onChange={(e) => {
                        const next = [...metadataItems]
                        next[idx] = { ...next[idx]!, key: e.target.value }
                        onState({ ...state, metadata: next })
                      }}
                      placeholder="key (e.g. author)"
                      style={inputStyle}
                    />
                    <input
                      value={kv.value}
                      onChange={(e) => {
                        const next = [...metadataItems]
                        next[idx] = { ...next[idx]!, value: e.target.value }
                        onState({ ...state, metadata: next })
                      }}
                      placeholder="value"
                      style={inputStyle}
                    />
                    <button
                      className="btn"
                      onClick={() => {
                        const next = metadataItems.filter((_, i) => i !== idx)
                        onState({ ...state, metadata: next })
                      }}
                      aria-label="Remove metadata filter"
                    >
                      −
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              className="btn"
              onClick={() => onState({ ...state, metadata: [...metadataItems, { key: '', value: '' }] })}
            >
              Add metadata filter
            </button>
          </div>

          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={state.useMapBounds}
              onChange={(e) => onState({ ...state, useMapBounds: e.target.checked })}
            />
            <span>
              Filter by current map bounds{' '}
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                ({bbox ? bbox.map((n) => n.toFixed(3)).join(', ') : 'no bounds yet'})
              </span>
            </span>
          </label>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontWeight: 650 }}>Results</div>
          {results && (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              {results.pagination.totalElements} total
            </div>
          )}
        </div>

        {resultItems.length === 0 ? (
          <div style={{ color: 'var(--muted)', padding: '10px 0' }}>
            No results yet. Use filters and press Search.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0', display: 'grid', gap: 8 }}>
            {resultItems.map((m: MaterialDTO) => (
              <li key={m.id}>
                <button
                  className="btn"
                  style={{ width: '100%', justifyContent: 'space-between' }}
                  onClick={() => onSelectMaterial(m.id)}
                >
                  <span style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.title}
                    <span style={{ color: 'var(--muted)' }}> • {m.creationDate}</span>
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 10 }}>{m.location}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

      </div>
    </div>
  )
}

const inputStyle: CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  borderRadius: 10,
  padding: '8px 10px',
}
