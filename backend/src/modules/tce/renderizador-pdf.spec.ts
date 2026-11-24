import type { ConfigService } from '@nestjs/config';
import { TipoEstagio } from '../../generated/prisma/enums.js';
import { RenderizadorPdfService } from './renderizador-pdf.service.js';
import { lerConfiguracaoTce, montarDadosTce } from './tce-dados.js';
import { CONFIG_TCE, estagiarioCompleto } from '../../../test/fixtures/tce.js';

// Sem Chromium: confere o HTML que vai para o navegador.
describe('RenderizadorPdfService.montarHtml', () => {
  const renderizador = new RenderizadorPdfService({
    get: () => undefined,
  } as never as ConfigService);
  const dados = (extra = {}) =>
    montarDadosTce(
      { tipoEstagio: TipoEstagio.obrigatorio, estagiarios: [] },
      estagiarioCompleto(extra),
      lerConfiguracaoTce((nome) => CONFIG_TCE[nome]),
      new Date('2026-11-24T15:00:00Z'),
    );

  it('preenche todos os campos do template', async () => {
    const html = await renderizador.montarHtml(dados());

    expect(html).not.toMatch(/\{\{/);
    expect(html).toContain('Ana Souza');
    expect(html).toContain('CPF: 123.456.789-01');
    expect(html).toContain('INÍCIO: 01/12/2026 e TÉRMINO:');
    expect(html).toContain('São Luís (MA), 24 de novembro de 2026.');
    expect(html).toMatch(/\( X \) Estágio Obrigatório;/);
    expect(html).toMatch(/\(\s*\) Pós-Graduação;/);
  });

  it('embute imagens e a fonte serifada, sem caminho relativo', async () => {
    const html = await renderizador.montarHtml(dados());

    expect(html).not.toContain('assets/');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toMatch(/@font-face \{ font-family: 'Times New Roman'; font-weight: 700;/);
  });

  it('escapa HTML vindo dos dados do lote', async () => {
    const html = await renderizador.montarHtml(dados({ nome: '<img src=x onerror=alert(1)>' }));

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;');
  });
});
