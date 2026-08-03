export function GuestError({ message }: { message: string }) {
  if (!message) return null;
  return <div className="form-error" role="alert" aria-atomic="true">{message}</div>;
}
