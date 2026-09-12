// mammoth and pdfjs weigh ~1 MB together: they are loaded on first use, not at startup.

export const ACCEPTED_EXTENSIONS = ['.docx', '.pdf', '.txt', '.md']

export type FileSource = 'docx' | 'pdf' | 'paste'

export interface ParsedFile {
  title: string
  content: string
  source: FileSource
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

/** Extracts the text of a dropped file. Throws a French error for unsupported formats. */
export async function fileToText(file: File): Promise<ParsedFile> {
  const ext = extensionOf(file.name)
  const title = ext ? file.name.slice(0, -ext.length) : file.name

  switch (ext) {
    case '.docx': {
      const { docxToText } = await import('./docx')
      return { title, content: await docxToText(file), source: 'docx' }
    }
    case '.pdf': {
      const { pdfToText } = await import('./pdf')
      return { title, content: await pdfToText(file), source: 'pdf' }
    }
    case '.txt':
    case '.md':
      return { title, content: (await file.text()).trim(), source: 'paste' }
    case '.one':
      throw new Error('Le format binaire OneNote (.one) n’est pas pris en charge. Exporte la page en Word ou PDF, ou utilise l’onglet OneNote.')
    case '.doc':
      throw new Error('Les anciens fichiers Word (.doc) ne sont pas pris en charge : enregistre-le au format .docx.')
    default:
      throw new Error(`Format non pris en charge (${ext || 'sans extension'}). Formats acceptés : ${ACCEPTED_EXTENSIONS.join(', ')}.`)
  }
}
