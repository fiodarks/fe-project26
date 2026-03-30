import { type CSSProperties, useMemo, useState } from 'react'
import type { HierarchyNode, MaterialDTO, UpdateMaterialCommand } from '../../api/types'
import { HierarchyPicker } from '../hierarchy/HierarchyPicker'
import type { LatLon } from '../map/LeafletMap'

const partialDateRe = /^\d{4}(-\d{2}(-\d{2})?)?$/
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

function extractHashTags(text: string): string[] {
  const matches = text.matchAll(/#([\p{L}\p{N}_-]+)/gu)
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of matches) {
    const tag = (m[1] ?? '').trim().toLowerCase()
    if (!tag) continue
    if (seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out
}

export function MaterialUpsertDrawer({
  mode,
  hierarchyRoot,
  pickedPoint,
  initial,
  prefillLocation,
  onCreate,
  onUpdate,
}: {
  mode: 'create' | 'edit'
  hierarchyRoot: HierarchyNode | null
  pickedPoint: LatLon | null
  initial?: MaterialDTO | null
  prefillLocation?: string
  onCreate: (form: FormData) => void
  onUpdate: (command: UpdateMaterialCommand) => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [locationDraft, setLocationDraft] = useState(initial?.location ?? '')
  const [locationTouched, setLocationTouched] = useState(mode === 'edit')
  const [creationDate, setCreationDate] = useState(initial?.creationDate ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [hierarchyId, setHierarchyId] = useState<string | null>(
    initial?.hierarchyId ?? null,
  )
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const locationValue =
    mode === 'edit' ? locationDraft : locationTouched ? locationDraft : (prefillLocation ?? locationDraft)

  const coords = useMemo(() => {
    if (!pickedPoint) return null
    return { lat: pickedPoint.lat, lon: pickedPoint.lon }
  }, [pickedPoint])

  const submit = () => {
    setError(null)
    if (!title.trim()) return setError('Title is required.')
    if (!locationValue.trim()) return setError('Location is required.')
    if (!creationDate.trim()) return setError('Creation date is required.')
    if (!partialDateRe.test(creationDate.trim()))
      return setError('Creation date must be YYYY, YYYY-MM, or YYYY-MM-DD.')
    if (!description.trim()) return setError('Description is required.')

    const tagList = extractHashTags(description.trim())

    if (mode === 'edit') {
      if (!hierarchyId) return setError('Hierarchy level is required.')
      onUpdate({
        title: title.trim(),
        location: locationValue.trim(),
        creationDate: creationDate.trim(),
        description: description.trim(),
        hierarchyId,
        tags: tagList,
      })
      return
    }

    if (!coords) return setError('Pick a point on the map (required).')
    if (!file) return setError('Photo file is required for upload.')
    if (file.size > MAX_PHOTO_BYTES) return setError('Photo must be 5MB or smaller.')

    const form = new FormData()
    form.append('title', title.trim())
    form.append('location', locationValue.trim())
    form.append('creationDate', creationDate.trim())
    form.append('description', description.trim())
    if (hierarchyId) form.append('hierarchyId', hierarchyId)
    form.append('file', file)

    if (coords) {
      form.append('lat', String(coords.lat))
      form.append('lon', String(coords.lon))
      // Backward-compatible: some backends may only read coordinates from metadata.
      form.append('metadata[lat]', String(coords.lat))
      form.append('metadata[lon]', String(coords.lon))
    }
    for (const t of tagList) form.append('tags', t)

    onCreate(form)
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {error && (
        <div
          style={{
            border: '1px solid var(--border)',
            padding: 10,
            borderRadius: 10,
            color: 'var(--danger)',
          }}
        >
          {error}
        </div>
      )}

      <label style={labelStyle}>
        <span style={labelSpanStyle}>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
      </label>

      <label style={labelStyle}>
        <span style={labelSpanStyle}>Location (text)</span>
        <input
          value={locationValue}
          onChange={(e) => {
            setLocationTouched(true)
            setLocationDraft(e.target.value)
          }}
          style={inputStyle}
          placeholder="Readable place name (for older residents)."
        />
      </label>

      <label style={labelStyle}>
        <span style={labelSpanStyle}>Creation date</span>
        <input
          value={creationDate}
          onChange={(e) => setCreationDate(e.target.value)}
          style={inputStyle}
          placeholder="YYYY or YYYY-MM or YYYY-MM-DD"
        />
      </label>

      <HierarchyPicker
        root={hierarchyRoot}
        selectedId={hierarchyId}
        onSelect={(id) => setHierarchyId(id)}
        emptyLabel="No category (let backend decide)"
        hint="Optional. If you choose one, the material is saved under that category; otherwise the backend decides."
      />

      <label style={labelStyle}>
        <span style={labelSpanStyle}>Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="You can add tags like #oldtown #bridge in the text."
          style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
        />
      </label>

      {mode === 'create' && (
        <label style={labelStyle}>
          <span style={labelSpanStyle}>Photo file</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const selected = e.target.files?.[0] ?? null
              if (!selected) return setFile(null)
              if (selected.size > MAX_PHOTO_BYTES) {
                setError('Photo must be 5MB or smaller.')
                setFile(null)
                e.target.value = ''
                return
              }
              setError(null)
              setFile(selected)
            }}
          />
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Up to 5MB.</div>
        </label>
      )}

      <button className="btn btnPrimary" onClick={submit}>
        {mode === 'edit' ? 'Save changes' : 'Upload'}
      </button>
    </div>
  )
}

const labelStyle: CSSProperties = { display: 'grid', gap: 6 }
const labelSpanStyle: CSSProperties = { fontWeight: 650 }
const inputStyle: CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  borderRadius: 10,
  padding: '8px 10px',
}
