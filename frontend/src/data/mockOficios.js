// Dados fictícios para o fluxo de Análise de Ofícios.
// Substituir pela integração com a API assim que o back-end expuser o recurso.

export const STATUS = {
  EM_ANDAMENTO: 'em_andamento',
  APROVADO: 'aprovado',
  REPROVADO: 'reprovado',
  ENCERRADO: 'encerrado',
}

export const STATUS_LABEL = {
  [STATUS.EM_ANDAMENTO]: 'Em andamento',
  [STATUS.APROVADO]: 'Aprovado',
  [STATUS.REPROVADO]: 'Reprovado',
  [STATUS.ENCERRADO]: 'Encerrado',
}

// Variante visual usada pelo componente <Badge> — ver src/components/ui/Badge.jsx
export const STATUS_VARIANT = {
  [STATUS.EM_ANDAMENTO]: 'pending',
  [STATUS.APROVADO]: 'approved',
  [STATUS.REPROVADO]: 'rejected',
  [STATUS.ENCERRADO]: 'closed',
}

const SUPERVISORES = [
  'Ana Beatriz Costa',
  'Bruno Henrique Silva',
  'Carla Mendes Pereira',
  'Daniel Rodrigues Neto',
  'Eduarda Lima Santos',
  'Felipe Araújo Souza',
]

const ALUNOS_POOL = [
  { nome: 'Ana Beatriz Costa', cpf: '111.222.333-44', matricula: '003-112233' },
  { nome: 'Bruno Henrique Silva', cpf: '222.333.444-55', matricula: '003-445566' },
  { nome: 'Carla Mendes Pereira', cpf: '333.444.555-66', matricula: '003-778899' },
  { nome: 'Daniel Rodrigues Neto', cpf: '444.555.666-77', matricula: '003-101112' },
  { nome: 'Eduarda Lima Santos', cpf: '555.666.777-88', matricula: '003-131415' },
  { nome: 'Felipe Araújo Souza', cpf: '666.777.888-99', matricula: '003-161718' },
]

const TURNOS = ['Matutino', 'Vespertino', 'Noturno']
const OPERADOR = 'Guilherme Ferreira dos Reis'

function pad(n) {
  return String(n).padStart(3, '0')
}

function buildOficio(index) {
  const numero = `OF-2025-${101 + index}`
  const statusCycle = [
    STATUS.EM_ANDAMENTO,
    STATUS.APROVADO,
    STATUS.EM_ANDAMENTO,
    STATUS.REPROVADO,
    STATUS.ENCERRADO,
  ]
  const status = statusCycle[index % statusCycle.length]
  const supervisor = SUPERVISORES[index % SUPERVISORES.length]
  const day = 1 + (index % 27)
  const month = 1 + (index % 12)

  const grupo1 = ALUNOS_POOL.slice(0, 2 + (index % 2))
  const grupo2 = ALUNOS_POOL.slice(2, 4 + (index % 2))

  return {
    id: `oficio-${pad(index)}`,
    numero,
    supervisor,
    data: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/2025`,
    status,
    operador: OPERADOR,
    eta: '16/05/2024 11:39',
    unidade: {
      concedente: 'Porto Organizado do Maranhão',
      setor: `Setor de Operações ${String.fromCharCode(65 + (index % 4))}`,
      periodoInicio: '01/03/2025',
      periodoFim: '30/11/2025',
      seguro: {
        apolice: `AP-${10000 + index}`,
        seguradora: 'Seguradora Porto Seguro S.A.',
        vencimento: '28/02/2026',
      },
    },
    estrutura: {
      grupos: 2,
      alunos: grupo1.length + grupo2.length,
      turno: TURNOS[index % TURNOS.length],
      diasSemana: 'Segunda a Sexta',
      horario: '08:00 às 12:00',
      periodoInicio: '01/03/2025',
      periodoFim: '30/11/2025',
      semanas: 36,
      cargaSemanal: '20h',
      cargaTotal: '720h',
    },
    grupos: [
      { nome: 'Grupo 1', alunos: grupo1 },
      { nome: 'Grupo 2', alunos: grupo2 },
    ],
    motivoReprovacao: status === STATUS.REPROVADO ? 'Documentação do seguro fora do prazo de validade.' : null,
  }
}

export const mockOficios = Array.from({ length: 24 }, (_, i) => buildOficio(i))
