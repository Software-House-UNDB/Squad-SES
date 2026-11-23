import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PdfViewer from './PdfViewer.tsx';

const getDocument = vi.fn();

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

function pdfFalso(paginas: number) {
  return {
    promise: Promise.resolve({
      numPages: paginas,
      getPage: async () => ({
        getViewport: () => ({ width: 100, height: 140 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
    destroy: vi.fn(),
  };
}

describe('PdfViewer', () => {
  beforeEach(() => {
    getDocument.mockReset();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
  });

  it('mostra carregando e depois o número de páginas', async () => {
    getDocument.mockReturnValue(pdfFalso(3));
    render(<PdfViewer url="https://exemplo.test/a.pdf" titulo="Apólice" />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando documento');
    expect(await screen.findByText('3 páginas')).toBeInTheDocument();
    expect(getDocument).toHaveBeenCalledWith({ url: 'https://exemplo.test/a.pdf' });
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('mostra erro e permite tentar de novo', async () => {
    getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error('x')), destroy: vi.fn() });
    render(<PdfViewer url="https://exemplo.test/a.pdf" titulo="Apólice" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível abrir o PDF');

    getDocument.mockReturnValue(pdfFalso(1));
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('1 página')).toBeInTheDocument();
  });

  it('zoom muda o percentual e respeita os limites', async () => {
    getDocument.mockReturnValue(pdfFalso(1));
    render(<PdfViewer url="https://exemplo.test/a.pdf" titulo="Apólice" />);
    await screen.findByText('1 página');
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar zoom' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) await userEvent.click(screen.getByRole('button', { name: 'Diminuir zoom' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Diminuir zoom' })).toBeDisabled());
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('avisa quando o documento já cabe na tela (nada para rolar)', async () => {
    getDocument.mockReturnValue(pdfFalso(1));
    const aoFim = vi.fn();
    render(<PdfViewer url="https://exemplo.test/a.pdf" titulo="Apólice" onChegouAoFim={aoFim} />);
    await screen.findByText('1 página');
    await waitFor(() => expect(aoFim).toHaveBeenCalledTimes(1));
  });

  it('mudar o zoom redesenha sem baixar o PDF de novo nem repetir o aviso de fim', async () => {
    getDocument.mockReturnValue(pdfFalso(1));
    const aoFim = vi.fn();
    render(<PdfViewer url="https://exemplo.test/a.pdf" titulo="Apólice" onChegouAoFim={aoFim} />);
    await screen.findByText('1 página');
    await waitFor(() => expect(aoFim).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Aumentar zoom' }));
    expect(await screen.findByText('125%')).toBeInTheDocument();
    await screen.findByText('1 página');
    expect(getDocument).toHaveBeenCalledTimes(1);
    expect(aoFim).toHaveBeenCalledTimes(1);
  });
});
