export function LoadError() {
  return <section className="card padded" role="alert">
    <h1>No se pudo cargar esta sección</h1>
    <p>Compruebe la conexión con el servidor y vuelva a intentar.</p>
    <button type="button" className="btn secondary" onClick={() => window.location.reload()}>Reintentar</button>
  </section>;
}
