/** Supported upload types and their extensions. */
export const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const MIN_TEXT_CHARS = 200;

/** Normalises whitespace while keeping paragraph breaks. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extracts plain text from a PDF, Word (.docx) or text file. Scanned PDFs
 * (images only) contain no text and are reported as such rather than guessed.
 */
export async function extractText(data: ArrayBuffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await pdfText(pdf, { mergePages: false });
    return cleanText((Array.isArray(text) ? text : [text]).join("\n\n"));
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return cleanText(value);
  }
  if (mimeType === "text/plain") return cleanText(new TextDecoder("utf-8").decode(data));
  throw new Error("UNSUPPORTED_TYPE");
}
