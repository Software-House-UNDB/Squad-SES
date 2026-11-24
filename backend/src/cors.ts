// Lê CORS_ORIGIN ("https://a.com,https://b.com") e devolve a lista de origens.
// Espaços e barra final são removidos: o navegador manda a origem sem barra.
export function origensPermitidas(valor: string | undefined): string[] {
  return (valor ?? '')
    .split(',')
    .map((origem) => origem.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}
