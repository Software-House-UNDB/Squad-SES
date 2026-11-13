import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../../auth/session.ts';
import { ArquivoRepetidoError, enviarProcesso } from '../../services/processoService.ts';
import { loginAs, renderApp } from '../../test-utils.tsx';

// O envio real (API) ainda não existe; aqui ele é controlado pelo teste.
vi.mock('../../services/processoService.ts', async (original) => ({
  ...(await original<typeof import('../../services/processoService.ts')>()),
  enviarProcesso: vi.fn(),
}));
const enviarMock = vi.mocked(enviarProcesso);

// Conteúdo único por arquivo: o mesmo conteúdo em dois slots é tratado como arquivo repetido.
let sequencia = 0;
const pdf = (nome = 'doc.pdf') =>
  new File([`conteudo-${sequencia++}`], nome, { type: 'application/pdf' });

// Cola o texto de uma vez: digitar tecla por tecla estoura o tempo quando a suíte roda inteira.
async function colar(campo: HTMLElement, texto: string) {
  await userEvent.click(campo);
  await userEvent.paste(texto);
}

// Folga para máquinas lentas e para a execução com cobertura.
vi.setConfig({ testTimeout: 20000 });

const ANA = ['Ana Souza', '52998224725', '2024001'] as const;
const BIA = ['Bia Lima', '11144477735', '2024002'] as const;
const CAIO = ['Caio Reis', '39053344705', '2024003'] as const;

function abrir() {
  loginAs('representante_ies');
  return renderApp('/gerenciamento/novo-processo');
}

async function preencher(nome: string, cpf: string, matricula: string, curso = 'Enfermagem') {
  await colar(screen.getByLabelText('Nome completo'), nome);
  await colar(screen.getByLabelText('CPF'), cpf);
  await colar(screen.getByLabelText('Matrícula'), matricula);
  await colar(screen.getByLabelText('Curso'), curso);
}

const adicionarAoLote = () =>
  userEvent.click(screen.getByRole('button', { name: 'Adicionar ao lote' }));

async function adicionar([nome, cpf, matricula]: readonly [string, string, string], menor = false) {
  await preencher(nome, cpf, matricula);
  if (menor) {
    await userEvent.click(screen.getByLabelText(/Estagiário menor de idade/));
    await colar(screen.getByLabelText('Nome do responsável'), 'Maria Souza');
  }
  await adicionarAoLote();
}

// Anexar calcula o hash do arquivo (assíncrono): espera o nome aparecer na tela.
async function anexar(rotulo: string, arquivo: File = pdf()) {
  const antes = screen.queryAllByText(arquivo.name).length;
  await userEvent.upload(screen.getByLabelText(`Anexar ${rotulo}`), arquivo);
  await waitFor(() => expect(screen.queryAllByText(arquivo.name).length).toBeGreaterThan(antes));
}

/** Anexa todo o pacote de um lote com um estagiário maior de idade (Ana). */
async function completarPacoteDeUmEstagiario() {
  for (const rotulo of [
    'Plano de atividades',
    'Apólice de seguro',
    'Lista oficial de indicados',
    'Documentos pessoais',
  ]) {
    await anexar(rotulo);
  }
}

const botaoEnviar = () => screen.getByRole('button', { name: /Enviar processo|Enviando/ });

describe('Novo processo de documentação', () => {
  beforeEach(() => {
    clearSession();
    enviarMock.mockReset();
    enviarMock.mockResolvedValue(undefined);
  });

  describe('estado inicial', () => {
    it('começa sem estagiários, como rascunho, com o envio bloqueado e dizendo por quê', () => {
      abrir();
      expect(screen.getByText('Rascunho')).toBeInTheDocument();
      expect(screen.getByText('0 no lote')).toBeInTheDocument();
      expect(botaoEnviar()).toBeDisabled();
      expect(screen.getByText('Adicione ao menos um estagiário.')).toBeInTheDocument();
      expect(screen.getByText('Plano de atividades', { selector: '.np-pendencias li' })).toBeInTheDocument();
    });

    it('liga o botão de enviar à lista de pendências (leitor de tela)', () => {
      abrir();
      const pendencias = document.getElementById(botaoEnviar().getAttribute('aria-describedby')!);
      expect(pendencias).toHaveTextContent('Para enviar, falta:');
    });

    it('mostra o TCE como gerado pelo sistema, sem campo para anexar (RF-10)', () => {
      abrir();
      expect(screen.getByText('Gerado pelo sistema')).toBeInTheDocument();
      expect(screen.queryByLabelText(/Anexar Termo de compromisso/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Anexar TCE/)).not.toBeInTheDocument();
    });

    it('não mostra campos que não existem no projeto (ofício, tipo de estágio, endereço)', () => {
      abrir();
      for (const texto of [/ofício/i, /tipo de estágio/i, /CEP/, /Cidade/]) {
        expect(screen.queryByText(texto)).not.toBeInTheDocument();
      }
    });

    it('pede os documentos do estagiário só depois de ele entrar no lote', () => {
      abrir();
      expect(screen.getByText(/Adicione estagiários ao lote para anexar/)).toBeInTheDocument();
      expect(screen.queryByLabelText('Anexar Documentos pessoais')).not.toBeInTheDocument();
    });
  });

  describe('lote de estagiários (RF-06)', () => {
    it('mostra erro ao lado de cada campo vazio, foca o primeiro e não adiciona', async () => {
      abrir();
      await adicionarAoLote();
      expect(screen.getByText('Informe o nome completo.')).toBeInTheDocument();
      expect(screen.getByText(/CPF inválido/)).toBeInTheDocument();
      expect(screen.getByText('Informe a matrícula.')).toBeInTheDocument();
      expect(screen.getByText('Informe o curso.')).toBeInTheDocument();
      expect(screen.getByLabelText('Nome completo')).toHaveFocus();
      expect(screen.getByLabelText('Nome completo')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText('0 no lote')).toBeInTheDocument();
    });

    it('recusa CPF com dígitos verificadores errados', async () => {
      abrir();
      await preencher('Ana Souza', '11111111111', '2024001');
      await adicionarAoLote();
      expect(screen.getByText(/CPF inválido/)).toBeInTheDocument();
      expect(screen.getByLabelText('CPF')).toHaveFocus();
    });

    it('limpa o erro do campo quando a pessoa volta a digitar', async () => {
      abrir();
      await adicionarAoLote();
      await colar(screen.getByLabelText('Nome completo'), 'A');
      expect(screen.queryByText('Informe o nome completo.')).not.toBeInTheDocument();
    });

    it('aplica a máscara no CPF enquanto digita', async () => {
      abrir();
      await colar(screen.getByLabelText('CPF'), '52998224725');
      expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25');
    });

    it('adiciona o estagiário, limpa o formulário e volta o foco para o nome', async () => {
      abrir();
      await adicionar(ANA);
      const lista = screen.getByRole('list', { name: 'Estagiários do lote' });
      expect(within(lista).getByText('Ana Souza')).toBeInTheDocument();
      expect(within(lista).getByText(/Mat\. 2024001 · CPF 529\.982\.247-25/)).toBeInTheDocument();
      expect(screen.getByText('1 no lote')).toBeInTheDocument();
      expect(screen.getByLabelText('Nome completo')).toHaveValue('');
      expect(screen.getByLabelText('Nome completo')).toHaveFocus();
    });

    it('barra CPF repetido e matrícula repetida no mesmo processo', async () => {
      abrir();
      await adicionar(ANA);
      await preencher('Outra Pessoa', ANA[1], ANA[2]);
      await adicionarAoLote();
      expect(screen.getByText('Este CPF já está neste processo.')).toBeInTheDocument();
      expect(screen.getByText('Esta matrícula já está neste processo.')).toBeInTheDocument();
      expect(screen.getByText('1 no lote')).toBeInTheDocument();
    });

    it('menor de idade exige o nome do responsável', async () => {
      abrir();
      await preencher(...BIA);
      await userEvent.click(screen.getByLabelText(/Estagiário menor de idade/));
      await adicionarAoLote();
      expect(screen.getByText('Informe o nome do responsável pelo menor.')).toBeInTheDocument();
      expect(screen.getByLabelText('Nome do responsável')).toHaveFocus();
      expect(screen.getByText('0 no lote')).toBeInTheDocument();
    });

    it('desmarcar "menor de idade" esconde e zera o responsável', async () => {
      abrir();
      const caixa = screen.getByLabelText(/Estagiário menor de idade/);
      await userEvent.click(caixa);
      await colar(screen.getByLabelText('Nome do responsável'), 'Maria');
      await userEvent.click(caixa);
      expect(screen.queryByLabelText('Nome do responsável')).not.toBeInTheDocument();
      await userEvent.click(caixa);
      expect(screen.getByLabelText('Nome do responsável')).toHaveValue('');
    });

    it('mostra o selo e o responsável do menor de idade na lista', async () => {
      abrir();
      await adicionar(BIA, true);
      const lista = screen.getByRole('list', { name: 'Estagiários do lote' });
      expect(within(lista).getByText('Menor de idade')).toBeInTheDocument();
      expect(within(lista).getByText(/Responsável: Maria Souza/)).toBeInTheDocument();
    });
  });

  describe('pacote de documentos (RF-08, RF-09, RF-13)', () => {
    it('maior de idade leva só documentos pessoais; menor leva também identidade e declaração', async () => {
      abrir();
      await adicionar(ANA);
      await adicionar(BIA, true);
      expect(screen.getAllByLabelText('Anexar Documentos pessoais')).toHaveLength(2);
      expect(screen.getAllByLabelText('Anexar Identidade do responsável')).toHaveLength(1);
      expect(screen.getAllByLabelText('Anexar Declaração do responsável')).toHaveLength(1);
      expect(screen.getAllByText('0 de 7')).toHaveLength(2); // selo do pacote e resumo
    });

    it('anexar atualiza os contadores e remover desfaz', async () => {
      abrir();
      await anexar('Plano de atividades');
      expect(screen.getByText('doc.pdf')).toBeInTheDocument();
      expect(screen.getAllByText('1 de 3').length).toBeGreaterThan(0);
      expect(screen.queryByText('Plano de atividades', { selector: '.np-pendencias li' })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Remover Plano de atividades' }));
      expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument();
      expect(screen.getAllByText('0 de 3').length).toBeGreaterThan(0);
      expect(screen.getByLabelText('Anexar Plano de atividades')).toBeInTheDocument();
    });

    it('recusa imagem (JPG/PNG): o backend aceita só PDF', async () => {
      abrir();
      await adicionar(ANA);
      await userEvent.upload(
        screen.getByLabelText('Anexar Documentos pessoais'),
        new File(['x'], 'rg.png', { type: 'image/png' }),
        { applyAccept: false },
      );
      expect(screen.getByText('Formato não aceito. Envie o arquivo em PDF.')).toBeInTheDocument();
      expect(screen.queryByText('rg.png')).not.toBeInTheDocument();
    });

    it('recusa o mesmo arquivo em dois documentos e libera ao anexar outro', async () => {
      abrir();
      const igual = () => new File(['mesmo-conteudo'], 'unico.pdf', { type: 'application/pdf' });
      await anexar('Plano de atividades', igual());
      await userEvent.upload(screen.getByLabelText('Anexar Apólice de seguro'), igual());
      expect(await screen.findByText(/já foi anexado em outro documento/)).toBeInTheDocument();
      expect(screen.getAllByText('unico.pdf')).toHaveLength(1);

      await anexar('Apólice de seguro', pdf('apolice.pdf'));
      expect(screen.queryByText(/já foi anexado em outro documento/)).not.toBeInTheDocument();
    });

    it('recusa formato não aceito e diz qual usar', async () => {
      abrir();
      await userEvent.upload(
        screen.getByLabelText('Anexar Plano de atividades'),
        new File(['x'], 'a.txt', { type: 'text/plain' }),
        { applyAccept: false },
      );
      expect(screen.getByText('Formato não aceito. Envie o arquivo em PDF.')).toBeInTheDocument();
      expect(screen.queryByText('a.txt')).not.toBeInTheDocument();
    });

    it('recusa arquivo acima de 20 MB e some o erro quando um arquivo bom é anexado', async () => {
      abrir();
      const grande = pdf('grande.pdf');
      Object.defineProperty(grande, 'size', { value: 21 * 1024 * 1024 });
      await userEvent.upload(screen.getByLabelText('Anexar Apólice de seguro'), grande);
      expect(screen.getByText('O arquivo tem 21,0 MB. O limite é 20 MB.')).toBeInTheDocument();
      expect(screen.queryByText('grande.pdf')).not.toBeInTheDocument();

      await anexar('Apólice de seguro', pdf('apolice.pdf'));
      expect(screen.queryByText(/O limite é 20 MB/)).not.toBeInTheDocument();
      expect(screen.getByText('apolice.pdf')).toBeInTheDocument();
    });

    it('resume as pendências quando são muitas', async () => {
      abrir();
      await adicionar(ANA);
      await adicionar(BIA);
      await adicionar(CAIO);
      // plano, apólice, lista + 3 documentos pessoais = 6; mostra 4 e resume o resto
      expect(screen.getByText('e mais 2 item(ns)')).toBeInTheDocument();
    });
  });

  describe('remover estagiário', () => {
    it('leva os documentos dele junto e avisa', async () => {
      abrir();
      await adicionar(ANA);
      await adicionar(BIA);
      await anexar('Plano de atividades');
      const [pessoaisAna] = screen.getAllByLabelText('Anexar Documentos pessoais');
      await userEvent.upload(pessoaisAna, pdf('ana.pdf'));

      await userEvent.click(screen.getByRole('button', { name: 'Remover Ana Souza' }));

      expect(screen.getByText('1 no lote')).toBeInTheDocument();
      expect(screen.queryByText('ana.pdf')).not.toBeInTheDocument();
      expect(screen.getByText('doc.pdf')).toBeInTheDocument(); // plano do processo continua
      expect(screen.getByText('Estagiário removido')).toBeInTheDocument();
    });

    it('"Desfazer" devolve o estagiário na mesma posição, com os documentos', async () => {
      abrir();
      await adicionar(ANA);
      await adicionar(BIA);
      const [pessoaisAna] = screen.getAllByLabelText('Anexar Documentos pessoais');
      await userEvent.upload(pessoaisAna, pdf('ana.pdf'));

      await userEvent.click(screen.getByRole('button', { name: 'Remover Ana Souza' }));
      await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));

      const nomes = within(screen.getByRole('list', { name: 'Estagiários do lote' }))
        .getAllByText(/Souza|Lima/, { selector: '.np-aluno__nome' })
        .map((el) => el.textContent);
      expect(nomes).toEqual(['Ana Souza', 'Bia Lima']);
      expect(screen.getByText('ana.pdf')).toBeInTheDocument();
      expect(screen.queryByText('Estagiário removido')).not.toBeInTheDocument();
    });
  });

  describe('envio', () => {
    it('só libera o envio com o pacote completo e avisa que está tudo certo', async () => {
      abrir();
      await adicionar(ANA);
      expect(botaoEnviar()).toBeDisabled();
      await completarPacoteDeUmEstagiario();
      expect(botaoEnviar()).toBeEnabled();
      expect(screen.getByText('Pacote completo. Pode enviar.')).toBeInTheDocument();
    });

    it('envia, mostra "Enviando…" e depois a confirmação com o status Enviado', async () => {
      let terminar!: () => void;
      enviarMock.mockReturnValue(new Promise<void>((resolve) => (terminar = resolve)));
      abrir();
      await adicionar(ANA);
      await completarPacoteDeUmEstagiario();

      await userEvent.click(botaoEnviar());
      expect(botaoEnviar()).toBeDisabled();
      expect(botaoEnviar()).toHaveTextContent('Enviando…');
      expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled();
      expect(enviarMock).toHaveBeenCalledTimes(1);

      terminar();
      expect(await screen.findByRole('heading', { name: 'Processo enviado' })).toBeInTheDocument();
      expect(screen.getByText('Enviado')).toBeInTheDocument();
      expect(screen.getByText(/1 estagiário\(s\) · 4 documento\(s\)/)).toBeInTheDocument();
    });

    it('não envia duas vezes com duplo clique', async () => {
      enviarMock.mockReturnValue(new Promise<void>(() => {}));
      abrir();
      await adicionar(ANA);
      await completarPacoteDeUmEstagiario();
      await userEvent.dblClick(botaoEnviar());
      expect(enviarMock).toHaveBeenCalledTimes(1);
    });

    it('se o envio falhar, mostra o erro, mantém os dados e permite tentar de novo', async () => {
      enviarMock.mockRejectedValueOnce(new Error('sem rede'));
      abrir();
      await adicionar(ANA);
      await completarPacoteDeUmEstagiario();

      await userEvent.click(botaoEnviar());
      expect(await screen.findByRole('alert', {}, { timeout: 2000 })).toHaveTextContent(
        /Não foi possível enviar o processo/,
      );
      expect(screen.getByText('1 no lote')).toBeInTheDocument();
      expect(screen.getAllByText('doc.pdf', { selector: '.np-arquivo__nome' })).toHaveLength(4);
      expect(botaoEnviar()).toBeEnabled();

      await userEvent.click(botaoEnviar());
      expect(await screen.findByRole('heading', { name: 'Processo enviado' })).toBeInTheDocument();
      expect(enviarMock).toHaveBeenCalledTimes(2);
    });

    it('se a API recusar arquivo repetido (409), explica o motivo e permite corrigir', async () => {
      enviarMock.mockRejectedValueOnce(new ArquivoRepetidoError());
      abrir();
      await adicionar(ANA);
      await completarPacoteDeUmEstagiario();
      await userEvent.click(botaoEnviar());
      expect(await screen.findByRole('alert')).toHaveTextContent(/já foi anexado em outro documento/);
      expect(botaoEnviar()).toBeEnabled();
    });

    it('"Criar outro processo" volta para um formulário vazio', async () => {
      abrir();
      await adicionar(ANA);
      await completarPacoteDeUmEstagiario();
      await userEvent.click(botaoEnviar());
      await userEvent.click(await screen.findByRole('button', { name: 'Criar outro processo' }));

      expect(screen.getByText('0 no lote')).toBeInTheDocument();
      expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument();
      expect(botaoEnviar()).toBeDisabled();
    });

    it('não quebra se a pessoa sair da tela enquanto o envio está em andamento', async () => {
      let terminar!: () => void;
      enviarMock.mockReturnValue(new Promise<void>((resolve) => (terminar = resolve)));
      const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { unmount } = abrir();
      await adicionar(ANA);
      await completarPacoteDeUmEstagiario();
      await userEvent.click(botaoEnviar());

      unmount();
      terminar();
      await waitFor(() => expect(enviarMock).toHaveBeenCalled());
      expect(erro).not.toHaveBeenCalled();
      erro.mockRestore();
    });
  });

  describe('rascunho', () => {
    it('"Salvar rascunho" confirma com uma notificação', async () => {
      abrir();
      await userEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
      expect(screen.getByText('Rascunho salvo')).toBeInTheDocument();
    });
  });
});
