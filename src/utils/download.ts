// Saving a file to the person's computer (the Clients and Audit Logs exports, and the Dashboard report).

/** Starts a download of `blob`, named `filename`. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Give the browser time to start the download before the file's temporary address is released.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Starts a download of a CSV file (text made by sheetToCsvFile). */
export function downloadCsv(csv: string, filename: string) {
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}
