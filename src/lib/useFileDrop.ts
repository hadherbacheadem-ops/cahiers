import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react'

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

/**
 * Drag-and-drop (and paste) of files onto an element. `dragging` is true while files are held over it
 * (child elements fire their own enter / leave events, hence the counter). Only drags that carry files
 * are handled: text dragged inside a field behaves as usual.
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  return {
    dragging,
    props: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current++
        setDragging(true)
      },
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      },
      onDragLeave: (e: DragEvent) => {
        if (!hasFiles(e)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragging(false)
      },
      onDrop: (e: DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length) onFiles(files)
      },
      /** A screenshot or a copied image pasted anywhere in the panel; pasted text is left alone. */
      onPaste: (e: ClipboardEvent) => {
        const images = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
        if (!images.length) return
        e.preventDefault()
        onFiles(images)
      },
    },
  }
}
