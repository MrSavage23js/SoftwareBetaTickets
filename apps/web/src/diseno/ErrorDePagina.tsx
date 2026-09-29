import { Component, type ReactNode } from 'react';

/** Último recurso: si un error de programación rompe una pantalla, se muestra un aviso en lugar de una página en blanco. */
export class ErrorDePagina extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty mal" role="alert" style={{ minHeight: '100vh', justifyContent: 'center' }}>
        <b>Algo salió mal en esta pantalla</b>
        <span>Recarga la página. Si el problema continúa, avisa a soporte.</span>
        <button className="btn p" onClick={() => window.location.reload()}>
          Recargar
        </button>
      </div>
    );
  }
}
