// Turns a failed save into a message people can act on.
// `status` is the HTTP status from the server, or null when the server could not be reached at all.
export function describeSaveFailure(status: number | null, serverMessage?: string): string {
  const prefix = 'Your change was not saved.';
  if (status === null) {
    return `${prefix} The server could not be reached. Check your internet connection and try again.`;
  }
  if (status === 401) {
    return `${prefix} Your login has expired. Sign out, sign in again, and redo the change.`;
  }
  // These are refusals where the server explains the reason in plain words.
  if ((status === 400 || status === 403 || status === 409 || status === 413) && serverMessage) {
    return `${prefix} ${serverMessage}`;
  }
  if (status === 403) {
    return `${prefix} You don't have permission to make this change.`;
  }
  return `${prefix} The server reported a problem (error ${status}). Please try again.`;
}
