import mammoth from 'mammoth'
import { htmlToText } from '../htmlToText'

/** .docx → light markdown text. Mammoth's default style map keeps Heading1..6, lists and tables. */
export async function docxToText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer })
  return htmlToText(html)
}
