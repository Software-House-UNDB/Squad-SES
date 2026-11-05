import { ChevronLeft, ChevronRight } from 'lucide-react'
import './ui.css'

function getPageNumbers(page: number, pageCount: number) {
  const pages = new Set([1, pageCount, page, page - 1, page + 1])
  return [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b)
}

interface PaginationProps {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
}

/** Paginação numérica com reticências para intervalos longos. */
export default function Pagination({ page, pageCount, total, pageSize, onPageChange }: PaginationProps) {
  if (pageCount <= 1) return null

  const firstItem = (page - 1) * pageSize + 1
  const lastItem = Math.min(page * pageSize, total)
  const pageNumbers = getPageNumbers(page, pageCount)

  return (
    <div className="pagination">
      <span className="pagination__summary">
        Mostrando {firstItem}–{lastItem} de {total}
      </span>

      <div className="pagination__controls">
        <button
          type="button"
          className="pagination__nav"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
        </button>

        {pageNumbers.map((num, i) => {
          const prev = pageNumbers[i - 1]
          const showEllipsis = prev !== undefined && num - prev > 1
          return (
            <span key={num} style={{ display: 'contents' }}>
              {showEllipsis && <span className="pagination__ellipsis">…</span>}
              <button
                type="button"
                className={`pagination__page ${num === page ? 'pagination__page--active' : ''}`}
                onClick={() => onPageChange(num)}
                aria-current={num === page ? 'page' : undefined}
              >
                {num}
              </button>
            </span>
          )
        })}

        <button
          type="button"
          className="pagination__nav"
          onClick={() => onPageChange(page + 1)}
          disabled={page === pageCount}
          aria-label="Próxima página"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
