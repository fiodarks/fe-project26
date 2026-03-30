import { type CSSProperties, useMemo, useRef, useState } from 'react'
import type { HierarchyNode, MaterialDTO, UpdateMaterialCommand } from '../../api/types'
import { HierarchyPicker } from '../hierarchy/HierarchyPicker'
import type { LatLon } from '../map/LeafletMap'

const partialDateRe = /^\d{4}(-\d{2}(-\d{2})?)?$/
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

function inferImageMimeType(file: File): string | null {
  if (file.type && file.type.startsWith('image/')) return file.type
  const name = (file.name ?? '').toLowerCase()
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.gif')) return 'image/gif'
  return null
}

function normalizeImageFile(file: File): File | null {
  const mime = inferImageMimeType(file)
  if (!mime) return null
  if (file.type === mime) return file
  // Some browsers provide empty File.type and then the multipart part becomes application/octet-stream.
  return new File([file], file.name, { type: mime, lastModified: file.lastModified })
}

function replaceFileExt(name: string, ext: string): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return `upload.${ext}`
  const lastDot = trimmed.lastIndexOf('.')
  if (lastDot <= 0) return `${trimmed}.${ext}`
  return `${trimmed.slice(0, lastDot)}.${ext}`
}

async function transcodeToJpeg(source: File, quality = 0.9): Promise<File> {
  const bitmap = await createImageBitmap(source)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context is unavailable.')
    ctx.drawImage(bitmap, 0, 0)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode JPEG.'))),
        'image/jpeg',
        quality,
      )
    })

    return new File([blob], replaceFileExt(source.name, 'jpg'), {
      type: 'image/jpeg',
      lastModified: source.lastModified,
    })
  } finally {
    bitmap.close()
  }
}

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
  const [fileBusy, setFileBusy] = useState(false)
  const filePickSeqRef = useRef(0)

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
    if (fileBusy) return setError('Please wait for the image to finish processing.')
    if (file.size > MAX_PHOTO_BYTES) return setError('Photo must be 5MB or smaller.')
    const normalizedFile = normalizeImageFile(file)
    if (!normalizedFile) return setError('Unsupported file type. Please upload an image.')

    const form = new FormData()
    form.append('title', title.trim())
    form.append('location', locationValue.trim())
    form.append('creationDate', creationDate.trim())
    form.append('description', description.trim())
    if (hierarchyId) form.append('hierarchyId', hierarchyId)
    form.append('file', normalizedFile, normalizedFile.name)

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
              const mySeq = (filePickSeqRef.current += 1)

              if (!selected) {
                setFileBusy(false)
                setFile(null)
                return
              }

              if (selected.size > MAX_PHOTO_BYTES) {
                setFileBusy(false)
                setError('Photo must be 5MB or smaller.')
                setFile(null)
                e.target.value = ''
                return
              }

              const normalized = normalizeImageFile(selected)
              if (!normalized) {
                setFileBusy(false)
                setError('Unsupported file type. Please upload an image.')
                setFile(null)
                e.target.value = ''
                return
              }

              // Always send a consistent format to BE: JPEG.
              if (normalized.type !== 'image/jpeg') {
                setFileBusy(true)
                setError(null)
                void (async () => {
                  try {
                    const jpeg = await transcodeToJpeg(normalized)
                    if (filePickSeqRef.current !== mySeq) return
                    if (jpeg.size > MAX_PHOTO_BYTES) {
                      setFileBusy(false)
                      setError('Photo must be 5MB or smaller.')
                      setFile(null)
                      e.target.value = ''
                      return
                    }
                    setFileBusy(false)
                    setFile(jpeg)
                  } catch {
                    if (filePickSeqRef.current !== mySeq) return
                    setFileBusy(false)
                    setError('Failed to process this image. Try a different file.')
                    setFile(null)
                    e.target.value = ''
                  }
                })()
                return
              }

              setFileBusy(false)
              setError(null)
              setFile(normalized)
            }}
          />
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            Up to 5MB. Non-JPEG images are converted to JPEG before upload.
          </div>
          {fileBusy ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Processing image…</div> : null}
        </label>
      )}

      <button className="btn btnPrimary" onClick={submit} disabled={fileBusy}>
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
