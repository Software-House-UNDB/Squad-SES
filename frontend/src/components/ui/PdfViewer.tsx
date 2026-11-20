import { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import './pdfViewer.css';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_PASSO = 0.25;

interface PdfViewerProps {
  /** URL do PDF (normalmente uma URL assinada do storage). */
  url: string;
  /** Nome acessível do visualizador, ex.: "Apólice de seguro". */
  titulo: string;
  /** Disparado uma vez quando o leitor rola até o fim do documento (usado na leitura obrigatória da assinatura). */
  onChegouAoFim?: () => void;
}

type Estado =
  | { fase: 'carregando' }
  | { fase: 'pronto'; paginas: number }
  | { fase: 'erro'; mensagem: string };

const MSG_ERRO =
  'Não foi possível abrir o PDF. Verifique a conexão e tente de novo; se o problema continuar, o link pode ter expirado.';

/**
 * Visualizador de PDF embutido (pdf.js). Mostra todas as páginas em rolagem contínua, com zoom.
 * O pdf.js só é carregado quando o componente aparece, para não pesar no bundle inicial.
 */
export default function PdfViewer({ url, titulo, onChegouAoFim }: PdfViewerProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const paginasRef = useRef<HTMLDivElement>(null);
  const chegouAoFim = useRef(false);
  const onChegouAoFimRef = useRef(onChegouAoFim);
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });
  const [zoom, setZoom] = useState(1);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    onChegouAoFimRef.current = onChegouAoFim;
  }, [onChegouAoFim]);

  const verificarFim = useCallback(() => {
    const area = areaRef.current;
    if (!area || chegouAoFim.current) return;
    if (area.scrollTop + area.clientHeight >= area.scrollHeight - 2) {
      chegouAoFim.current = true;
      onChegouAoFimRef.current?.();
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    let destruir: (() => void) | undefined;
    chegouAoFim.current = false;

    async function abrir() {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();

        const tarefa = pdfjs.getDocument({ url });
        destruir = () => void tarefa.destroy();
        const pdf = await tarefa.promise;
        if (cancelado) return;

        const container = paginasRef.current;
        if (!container) return;
        container.replaceChildren();
        const escala = 1.4 * zoom;

        for (let n = 1; n <= pdf.numPages; n++) {
          const pagina = await pdf.getPage(n);
          if (cancelado) return;
          const viewport = pagina.getViewport({ scale: escala });
          const canvas = document.createElement('canvas');
          canvas.className = 'pdf-viewer__pagina';
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `${titulo}, página ${n} de ${pdf.numPages}`);
          container.appendChild(canvas);
          const contexto = canvas.getContext('2d');
          if (contexto) await pagina.render({ canvasContext: contexto, viewport }).promise;
        }
        if (cancelado) return;
        setEstado({ fase: 'pronto', paginas: pdf.numPages });
        // Documento curto que já cabe na tela: não há o que rolar, então conta como lido.
        requestAnimationFrame(verificarFim);
      } catch {
        if (!cancelado) setEstado({ fase: 'erro', mensagem: MSG_ERRO });
      }
    }

    void abrir();
    return () => {
      cancelado = true;
      destruir?.();
    };
  }, [url, zoom, titulo, tentativa, verificarFim]);

  const pronto = estado.fase === 'pronto';

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer__barra" role="toolbar" aria-label="Controles do visualizador">
        <span className="pdf-viewer__info" aria-live="polite">
          {pronto ? `${estado.paginas} ${estado.paginas === 1 ? 'página' : 'páginas'}` : ''}
        </span>
        <div className="pdf-viewer__zoom">
          <button
            type="button"
            className="pdf-viewer__botao"
            aria-label="Diminuir zoom"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_PASSO))}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <span className="pdf-viewer__percentual">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="pdf-viewer__botao"
            aria-label="Aumentar zoom"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_PASSO))}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={areaRef}
        className="pdf-viewer__area"
        tabIndex={0}
        aria-label={titulo}
        onScroll={verificarFim}
      >
        {estado.fase === 'carregando' && (
          <p className="pdf-viewer__msg" role="status">
            Carregando documento…
          </p>
        )}
        {estado.fase === 'erro' && (
          <div className="pdf-viewer__msg pdf-viewer__msg--erro" role="alert">
            <p>{estado.mensagem}</p>
            <button type="button" className="pdf-viewer__botao" onClick={() => {
                setEstado({ fase: 'carregando' });
                setTentativa((t) => t + 1);
              }}>
              Tentar de novo
            </button>
          </div>
        )}
        <div ref={paginasRef} className="pdf-viewer__paginas" />
      </div>
    </div>
  );
}
