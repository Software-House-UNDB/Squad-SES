import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen, LoaderCircle } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader.tsx';
import Badge from '../../components/ui/Badge.tsx';
import { listarMeusProcessos } from '../../services/analiseService.ts';
import { formatarData, STATUS_BADGE, STATUS_LABEL } from '../AnaliseProcesso/analise.ts';
import '../AnaliseProcesso/analiseProcesso.css';
import './meusProcessos.css';

const MSG_ERRO_CARGA = 'Não foi possível carregar os seus processos. Confira a conexão e tente de novo.';

/** Processos enviados pela UNDB, com os devolvidos pela SES em destaque (RF-07, RF-12). */
export default function MeusProcessos() {
  const consulta = useQuery({ queryKey: ['meus-processos'], queryFn: listarMeusProcessos, retry: false });
  const processos = consulta.data;

  const cabecalho = (
    <PageHeader icon={FolderOpen} title="Meus processos" breadcrumb={['Gerenciamento', 'Meus processos']} />
  );

  if (consulta.isPending) {
    return (
      <>
        {cabecalho}
        <p className="ap-estado" role="status">
          <LoaderCircle size={18} className="ap-giro" aria-hidden="true" /> Carregando os processos…
        </p>
      </>
    );
  }

  if (!processos) {
    return (
      <>
        {cabecalho}
        <section className="ap-card ap-estado ap-estado--erro" role="alert">
          <p>{MSG_ERRO_CARGA}</p>
          <button type="button" className="ap-btn ap-btn--secondary" onClick={() => consulta.refetch()}>
            Tentar de novo
          </button>
        </section>
      </>
    );
  }

  const devolvidos = processos.filter((p) => p.status === 'pendencia').length;

  return (
    <>
      {cabecalho}

      {processos.length === 0 ? (
        <section className="ap-card mp-vazio">
          <p>Você ainda não enviou nenhum processo.</p>
          <Link to="/gerenciamento/novo-processo" className="ap-btn ap-btn--primary">
            Novo processo
          </Link>
        </section>
      ) : (
        <section className="ap-card mp-lista">
          {devolvidos > 0 && (
            <p className="ap-aviso" role="status">
              {devolvidos === 1
                ? '1 processo foi devolvido pela SES e aguarda a sua correção.'
                : `${devolvidos} processos foram devolvidos pela SES e aguardam a sua correção.`}
            </p>
          )}
          <div className="mp-tabela-wrap">
            <table className="mp-tabela">
              <caption className="mp-sr-only">Meus processos</caption>
              <thead>
                <tr>
                  <th scope="col">Processo</th>
                  <th scope="col">Status</th>
                  <th scope="col">Enviado em</th>
                  <th scope="col">Análise</th>
                  <th scope="col">Pendências</th>
                  <th scope="col">
                    <span className="mp-sr-only">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {processos.map((p) => {
                  const devolvido = p.status === 'pendencia';
                  return (
                    <tr key={p.id}>
                      <th scope="row">{p.numero}</th>
                      <td>
                        <Badge variant={STATUS_BADGE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                      </td>
                      <td>{formatarData(p.enviadoEm)}</td>
                      <td>
                        {p.analisados} de {p.totalDocumentos} analisados
                      </td>
                      <td>{p.pendencias > 0 ? p.pendencias : '—'}</td>
                      <td className="mp-acao">
                        <Link
                          to={`/gerenciamento/meus-processos/${p.id}`}
                          className={`ap-btn ap-btn--sm ${devolvido ? 'ap-btn--primary' : 'ap-btn--secondary'}`}
                          aria-label={`${devolvido ? 'Corrigir' : 'Ver'} processo ${p.numero}`}
                        >
                          {devolvido ? 'Corrigir' : 'Ver'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
