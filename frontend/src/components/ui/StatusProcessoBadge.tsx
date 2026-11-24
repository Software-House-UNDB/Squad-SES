import Badge from './Badge.tsx';
import {
  STATUS_PROCESSO_LABEL,
  STATUS_PROCESSO_VARIANT,
  type StatusProcesso,
} from '../../domain/processo.ts';

/** Selo colorido do status de um processo (os 7 estados da máquina de estados, RF-07). */
export default function StatusProcessoBadge({ status }: { status: StatusProcesso }) {
  return <Badge variant={STATUS_PROCESSO_VARIANT[status]}>{STATUS_PROCESSO_LABEL[status]}</Badge>;
}
