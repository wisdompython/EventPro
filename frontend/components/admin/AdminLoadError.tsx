type Props = { message: string; onRetry?: () => void }

export function AdminLoadError({ message, onRetry }: Props) {
  return <div role="alert" className="admin-load-error">
    <p>{message}</p>
    {onRetry && <button type="button" className="admin-secondary-action" onClick={onRetry}>Retry</button>}
  </div>
}
