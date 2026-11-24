import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCheck2, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/useAuth.ts';
import Badge from '../../components/ui/Badge.tsx';
import IconButton from '../../components/ui/IconButton.tsx';
import Modal from '../../components/ui/Modal.tsx';
import type { StatusProcesso } from '../../domain/processo.ts';
import {
  STATUS_RETORNO,
  TIPOS_RETORNO,
  ladoDoDocumento,
  podeEnviarRetorno,
  podeExcluirDocumento,
  type TipoRetorno,
} from '../../domain/retorno.ts';
import {
  listarDocumentos,
  removerDocumento,
  type DocumentoDoProcesso,
} from '../../services/retornoService.ts';
import { enviarDocumento } from '../../services/uploadService.ts';
import { formatarTamanho, validarArquivo } from '../NovoProcesso/pacote.ts';
import { mensagemDeErro, useUploads } from '../NovoProcesso/useUploads.ts';

const CHAVE_ENVIO = 'retorno';
const STATUS_COM_RETORNO: readonly StatusProcesso[] = [...STATUS_RETORNO, 'concluido'];
const MSG_ERRO_CARGA = 'Não foi possível carregar os documentos de retorno.';
const rotuloDoTipo = (tipo: string) => TIPOS_RETORNO.find((t) => t.tipo === tipo)?.rotulo ?? tipo;

interface Props {
  processoId: string;
  status: StatusProcesso;
  /** `criadoPorId` do processo (GET /processos/:id): separa o pacote da UNDB do retorno da SES. */
  criadoPorId: string;
}

/**
 * Documentos de retorno da coordenação SES (#50): lista os enviados pela SES com o selo
 * "Retorno da SES" e, para a coordenação, permite enviar e excluir. Serve também às telas do
 * representante (só leitura). Só aparece depois da aprovação, que é quando a API aceita retornos.
 */
export default function RetornoSES({ processoId, status, criadoPorId }: Props) {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const chave = ['documentos', processoId];
  const uid = useId();
  const uploads = useUploads();

  const visivel = STATUS_COM_RETORNO.includes(status);
  const consulta = useQuery({
    queryKey: chave,
    queryFn: () => listarDocumentos(processoId),
    retry: false,
    enabled: visivel,
  });

  const [tipo, setTipo] = useState<TipoRetorno>('oficio');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<DocumentoDoProcesso | null>(null);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  if (!visivel || !usuario) return null;
  const perfil = usuario.perfil;
  const processo = { criadoPorId };
  const retornos = (consulta.data ?? []).filter((d) => ladoDoDocumento(d, processo) === 'SES');
  const estado = uploads.estados[CHAVE_ENVIO];
  const enviando = estado?.fase === 'enviando';

  const recarregar = () => queryClient.invalidateQueries({ queryKey: chave });

  function escolher(e: ChangeEvent<HTMLInputElement>) {
    const escolhido = e.target.files?.[0] ?? null;
    e.target.value = '';
    uploads.limpar(CHAVE_ENVIO);
    const motivo = escolhido ? validarArquivo(escolhido) : null;
    setErroArquivo(motivo);
    setArquivo(motivo ? null : escolhido);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!arquivo) return;
    const alvo = arquivo;
    const ok = await uploads.enviar(CHAVE_ENVIO, ({ onProgresso, signal }) =>
      enviarDocumento(processoId, { arquivo: alvo, tipo }, { onProgresso, signal }),
    );
    if (ok) {
      setArquivo(null);
      uploads.limpar(CHAVE_ENVIO);
      await recarregar();
    }
  }

  async function tentarDeNovo() {
    if (await uploads.tentarDeNovo(CHAVE_ENVIO)) {
      setArquivo(null);
      uploads.limpar(CHAVE_ENVIO);
      await recarregar();
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    const alvo = excluindo;
    setExcluindo(null);
    setErroExclusao(null);
    try {
      await removerDocumento(processoId, alvo.id);
      await recarregar();
    } catch (e) {
      setErroExclusao(mensagemDeErro(e));
    }
  }

  return (
    <section className="ap-card ap-retorno" aria-labelledby={`${uid}-titulo`}>
      <h2 id={`${uid}-titulo`} className="ap-retorno__titulo">
        <FileCheck2 size={18} aria-hidden="true" /> Documentos de retorno da SES
      </h2>

      {consulta.isError && (
        <div role="alert" className="ap-erro">
          {MSG_ERRO_CARGA}{' '}
          <button type="button" className="ap-btn ap-btn--secondary ap-btn--sm" onClick={() => consulta.refetch()}>
            Tentar de novo
          </button>
        </div>
      )}

      {consulta.isSuccess &&
        (retornos.length === 0 ? (
          <p className="ap-retorno__vazio">Nenhum documento de retorno enviado ainda.</p>
        ) : (
          <ul className="ap-retorno__lista">
            {retornos.map((d) => (
              <li key={d.id} className="ap-retorno__item">
                <Badge variant="approved">Retorno da SES</Badge>
                <span className="ap-retorno__nome" title={d.nomeArquivo}>
                  {d.nomeArquivo}
                </span>
                <span className="ap-retorno__meta">
                  {rotuloDoTipo(d.tipo)} · {formatarTamanho(d.tamanhoBytes)}
                </span>
                {podeExcluirDocumento({ perfil, status, doc: d, processo }) && (
                  <IconButton
                    icon={Trash2}
                    variant="danger"
                    label={`Excluir ${d.nomeArquivo}`}
                    onClick={() => setExcluindo(d)}
                  />
                )}
              </li>
            ))}
          </ul>
        ))}

      {erroExclusao && (
        <p role="alert" className="ap-erro">
          {erroExclusao}
        </p>
      )}

      {podeEnviarRetorno(perfil, status) && (
        <form className="ap-retorno__form" onSubmit={enviar}>
          <label htmlFor={`${uid}-tipo`}>Tipo do documento</label>
          <select
            id={`${uid}-tipo`}
            value={tipo}
            disabled={enviando}
            onChange={(e) => setTipo(e.target.value as TipoRetorno)}
          >
            {TIPOS_RETORNO.map((t) => (
              <option key={t.tipo} value={t.tipo}>
                {t.rotulo}
              </option>
            ))}
          </select>

          <label htmlFor={`${uid}-arquivo`}>Arquivo do retorno</label>
          <input
            id={`${uid}-arquivo`}
            type="file"
            accept=".pdf,application/pdf"
            disabled={enviando}
            onChange={escolher}
          />
          {arquivo && (
            <span className="ap-retorno__meta">
              {arquivo.name} · {formatarTamanho(arquivo.size)}
            </span>
          )}

          {estado?.fase === 'enviando' && (
            <div className="ap-retorno__progresso">
              <progress max={100} value={estado.progresso} aria-label="Enviando o retorno" />
              <span>{estado.progresso}%</span>
              <button
                type="button"
                className="ap-btn ap-btn--secondary ap-btn--sm"
                onClick={() => uploads.cancelar(CHAVE_ENVIO)}
              >
                Cancelar envio
              </button>
            </div>
          )}
          {estado?.fase === 'erro' && (
            <div role="alert" className="ap-erro">
              {estado.mensagem}{' '}
              <button type="button" className="ap-btn ap-btn--secondary ap-btn--sm" onClick={tentarDeNovo}>
                Tentar de novo
              </button>
            </div>
          )}
          {erroArquivo && (
            <p role="alert" className="ap-erro">
              {erroArquivo}
            </p>
          )}

          <button type="submit" className="ap-btn ap-btn--primary" disabled={!arquivo || enviando}>
            Enviar retorno
          </button>
        </form>
      )}

      {excluindo && (
        <Modal
          title="Excluir documento de retorno"
          subtitle={excluindo.nomeArquivo}
          onClose={() => setExcluindo(null)}
          footer={
            <>
              <button type="button" className="ap-btn ap-btn--ghost" onClick={() => setExcluindo(null)}>
                Cancelar
              </button>
              <button type="button" className="ap-btn ap-btn--danger" onClick={confirmarExclusao}>
                Excluir documento
              </button>
            </>
          }
        >
          <p className="ap-modal-texto">
            O arquivo deixa de aparecer para a UNDB. Para devolver outro, envie o novo documento.
          </p>
        </Modal>
      )}
    </section>
  );
}
