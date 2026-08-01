export default function Loading() {
  return <main className="page-shell" aria-busy="true"><div className="skeleton" style={{ height: 48, width: "45%" }} /><div className="grid grid-3" style={{ marginTop: 24 }}>{[1,2,3].map(x => <div key={x} className="skeleton" style={{ height: 180 }} />)}</div></main>;
}
