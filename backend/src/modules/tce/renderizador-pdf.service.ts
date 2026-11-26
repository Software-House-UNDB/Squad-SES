import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Handlebars from 'handlebars';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { Browser } from 'puppeteer-core';
import type { DadosTce } from './tce-dados.js';

// backend/templates, tanto a partir de src/modules/tce (testes) quanto de dist/modules/tce.
const PASTA_TEMPLATES = new URL('../../../templates/', import.meta.url);

// As imagens do template viram data URI: a página é montada com setContent,
// sem servidor nem file://, e não depende do diretório de trabalho.
const IMAGENS: [string, string][] = [
  ['assets/fundo.jpg', 'image/jpeg'],
  ['assets/brasao.png', 'image/png'],
  ['assets/logo-espma.jpg', 'image/jpeg'],
];

// O Chromium do @sparticuz não traz Times New Roman. A Tinos (OFL, métrica
// compatível) entra com o mesmo nome, e o template não precisa mudar.
const FONTES: [number, string][] = [
  [400, '@fontsource/tinos/files/tinos-latin-400-normal.woff2'],
  [700, '@fontsource/tinos/files/tinos-latin-700-normal.woff2'],
];

const TEMPO_LIMITE_PAGINA_MS = 30_000;

/**
 * Gera PDFs a partir do backend/templates/tce.html com Chromium headless.
 *
 * O Render free tem 512 MB para a API inteira. Por isso: o navegador só abre
 * durante a geração e fecha no fim; uma aba por PDF; e uma geração por vez na
 * instância (fila). Medido com 60 TCEs num limite de 300 MB: ~210 MB de pico
 * no Chromium, ~150 ms por TCE.
 */
@Injectable()
export class RenderizadorPdfService {
  private readonly logger = new Logger(RenderizadorPdfService.name);
  private modelo?: Promise<HandlebarsTemplateDelegate<DadosTce>>;
  private fila: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: ConfigService) {}

  renderizarTces(lista: DadosTce[]): Promise<Buffer[]> {
    const tarefa = this.fila.then(() => this.renderizar(lista));
    this.fila = tarefa.catch(() => undefined);
    return tarefa;
  }

  // HTML final de um TCE, com imagens e fontes embutidas.
  async montarHtml(dados: DadosTce): Promise<string> {
    return (await this.obterModelo())(dados);
  }

  private async renderizar(lista: DadosTce[]): Promise<Buffer[]> {
    const modelo = await this.obterModelo();
    const navegador = await this.abrirNavegador();
    try {
      const pdfs: Buffer[] = [];
      for (const dados of lista) {
        const pagina = await navegador.newPage();
        try {
          await pagina.setContent(modelo(dados), {
            waitUntil: 'load',
            timeout: TEMPO_LIMITE_PAGINA_MS,
          });
          const pdf = await pagina.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            timeout: TEMPO_LIMITE_PAGINA_MS,
          });
          pdfs.push(Buffer.from(pdf));
        } finally {
          await pagina.close();
        }
      }
      return pdfs;
    } finally {
      await navegador.close().catch((erro: unknown) => this.logger.warn(`Chromium: ${erro}`));
    }
  }

  private obterModelo() {
    this.modelo ??= this.carregarModelo().catch((erro: unknown) => {
      this.modelo = undefined;
      throw erro;
    });
    return this.modelo;
  }

  private async carregarModelo() {
    let html = await readFile(new URL('tce.html', PASTA_TEMPLATES), 'utf8');
    for (const [caminho, mime] of IMAGENS) {
      const conteudo = await readFile(new URL(caminho, PASTA_TEMPLATES));
      html = html.replaceAll(caminho, `data:${mime};base64,${conteudo.toString('base64')}`);
    }
    const require = createRequire(import.meta.url);
    const fontes = await Promise.all(
      FONTES.map(async ([peso, modulo]) => {
        const conteudo = await readFile(require.resolve(modulo));
        return `@font-face { font-family: 'Times New Roman'; font-weight: ${peso}; src: url(data:font/woff2;base64,${conteudo.toString('base64')}) format('woff2'); }`;
      }),
    );
    html = html.replace('</head>', `<style>${fontes.join('\n')}</style></head>`);
    // strict: campo ausente nos dados é erro, não um TCE com lacuna em branco.
    return Handlebars.compile<DadosTce>(html, { strict: true });
  }

  private async abrirNavegador(): Promise<Browser> {
    try {
      const { default: puppeteer } = await import('puppeteer-core');
      // Desenvolvimento em macOS/Windows: o binário do @sparticuz é só Linux.
      // Aponte CHROMIUM_PATH para o Chrome ou Chromium instalado.
      const caminhoLocal = this.config.get<string>('CHROMIUM_PATH');
      if (caminhoLocal) {
        return await puppeteer.launch({ executablePath: caminhoLocal, headless: true });
      }
      // O @sparticuz só usa as próprias bibliotecas (libnspr4, libnss3...)
      // quando detecta ambiente Lambda/Netlify. O Render e a imagem node:20
      // não têm essas bibliotecas; esta variável liga o mesmo caminho. Ela é
      // lida no import, por isso o import é dinâmico e vem depois.
      process.env.AWS_LAMBDA_JS_RUNTIME ??= 'nodejs20.x';
      const { default: chromium } = await import('@sparticuz/chromium');
      chromium.setGraphicsMode = false;
      return await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } catch (erro) {
      this.logger.error('Falha ao abrir o Chromium para gerar PDF', erro);
      throw new ServiceUnavailableException('Gerador de PDF indisponível');
    }
  }
}
