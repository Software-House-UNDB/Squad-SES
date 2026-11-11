import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession } from '../../auth/session.ts';
import { loginAs, renderApp } from '../../test-utils.tsx';

const pdf = (nome = 'doc.pdf') => new File(['x'], nome, { type: 'application/pdf' });

async function abrir() {
  loginAs('representante_ies');
  renderApp('/gerenciamento/novo-processo');
}

async function adicionarEstagiario(nome: string, cpf: string, matricula: string, menor = false) {
  await userEvent.type(screen.getByLabelText('Nome completo'), nome);
  await userEvent.type(screen.getByLabelText('CPF'), cpf);
  await userEvent.type(screen.getByLabelText('Matrícula'), matricula);
  await userEvent.type(screen.getByLabelText('Curso'), 'Enfermagem');
  if (menor) {
    await userEvent.click(screen.getByLabelText(/Estagiário menor de idade/));
    await userEvent.type(screen.getByLabelText('Nome do responsável'), 'Maria Souza');
  }
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar ao lote' }));
}

describe('Novo processo de documentação', () => {
  beforeEach(() => clearSession());

  it('começa sem estagiários e com o envio bloqueado', async () => {
    await abrir();
    expect(screen.getByRole('button', { name: 'Enviar processo' })).toBeDisabled();
    expect(screen.getByText('Adicione ao menos um estagiário.')).toBeInTheDocument();
  });

  it('o TCE aparece como gerado pelo sistema, sem campo para anexar', async () => {
    await abrir();
    expect(screen.getByText('Gerado pelo sistema')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Anexar Termo de compromisso/)).not.toBeInTheDocument();
  });

  it('mostra erro ao lado do campo e não adiciona estagiário inválido', async () => {
    await abrir();
    await userEvent.type(screen.getByLabelText('CPF'), '11111111111');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar ao lote' }));
    expect(screen.getByText(/CPF inválido/)).toBeInTheDocument();
    expect(screen.getByText('Informe o nome completo.')).toBeInTheDocument();
    expect(screen.getByText('0 no lote')).toBeInTheDocument();
  });

  it('menor de idade pede responsável e três documentos', async () => {
    await abrir();
    await adicionarEstagiario('Bia Lima', '52998224725', '2024002', true);
    const lista = screen.getByRole('list', { name: 'Estagiários do lote' });
    expect(within(lista).getByText('Menor de idade')).toBeInTheDocument();
    expect(screen.getByLabelText('Anexar Identidade do responsável')).toBeInTheDocument();
    expect(screen.getByLabelText('Anexar Declaração do responsável')).toBeInTheDocument();
  });

  it('recusa arquivo em formato não aceito', async () => {
    await abrir();
    await userEvent.upload(
      screen.getByLabelText('Anexar Plano de atividades'),
      new File(['x'], 'a.txt', { type: 'text/plain' }),
      { applyAccept: false },
    );
    expect(screen.getByText(/Formato não aceito/)).toBeInTheDocument();
  });

  it('pacote completo libera o envio e mostra o processo como enviado', async () => {
    await abrir();
    await adicionarEstagiario('Ana Souza', '52998224725', '2024001');
    for (const rotulo of [
      'Plano de atividades',
      'Apólice de seguro',
      'Lista oficial de indicados',
      'Documentos pessoais',
    ]) {
      await userEvent.upload(screen.getByLabelText(`Anexar ${rotulo}`), pdf());
    }
    const enviar = screen.getByRole('button', { name: 'Enviar processo' });
    expect(enviar).toBeEnabled();
    expect(screen.getByText('Pacote completo. Pode enviar.')).toBeInTheDocument();

    await userEvent.click(enviar);
    expect(screen.getByRole('button', { name: /Enviando/ })).toBeDisabled();
    expect(
      await screen.findByRole('heading', { name: 'Processo enviado' }, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it('remover estagiário leva os documentos dele junto', async () => {
    await abrir();
    await adicionarEstagiario('Ana Souza', '52998224725', '2024001');
    await userEvent.upload(screen.getByLabelText('Anexar Documentos pessoais'), pdf());
    await userEvent.click(screen.getByRole('button', { name: 'Remover Ana Souza' }));
    expect(screen.getByText('0 no lote')).toBeInTheDocument();
    expect(screen.getByText(/Estagiário removido/)).toBeInTheDocument();
  });
});
