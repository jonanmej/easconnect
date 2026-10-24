import type { ReportInput } from "./ia-contract";

export type PdfRef = { storage_path: string; filename: string };
/** Maximum stored comparison copy (JSON bytes). Larger drafts disable comparison. */
export const SNAPSHOT_MAX_BYTES = 512 * 1024;
export const SNAPSHOT_TOO_LARGE =
  "La comparación no está disponible para este borrador: sus datos originales superan el tamaño permitido.";

/** Builds the stored record without PDF bytes, or a disabled marker when it exceeds the limit. */
export function buildSnapshotRecord(snapshot: {
  input: ReportInput; pdfRefs: PdfRef[]; markdownHeader: string; indicators: { label: string; value: string }[];
}) {
  const { pdfParts: _omit, ...input } = snapshot.input;
  const record = { input, pdfRefs: snapshot.pdfRefs, markdownHeader: snapshot.markdownHeader, indicators: snapshot.indicators };
  const bytes = new TextEncoder().encode(JSON.stringify(record)).byteLength;
  return bytes > SNAPSHOT_MAX_BYTES ? { disabled: true as const, reason: SNAPSHOT_TOO_LARGE } : record;
}
