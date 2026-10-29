/** All trip editor scopes share the same unsaved-form close policy. */
export function confirmTripEditorClose(
  formOpen: boolean,
  saving: boolean,
  confirm: (message: string) => boolean,
): boolean {
  if (saving) return false;
  return !formOpen || confirm("尚未儲存的內容不會保存，確定要關閉嗎？");
}
