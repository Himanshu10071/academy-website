export function AdminStatus({ error, loading, retry }: { error: string; loading: boolean; retry: () => void }) {
  if (error) {
    return <div className="admin-feedback" role="alert">
      <p>{error}</p>
      {loading && <button className="button button-secondary" type="button" onClick={retry}>Retry</button>}
    </div>;
  }
  if (loading) return <p role="status">Loading…</p>;
  return null;
}
