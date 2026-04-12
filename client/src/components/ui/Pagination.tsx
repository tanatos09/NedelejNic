import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  isLoading = false,
}) => {
  const pages: (number | null)[] = [];
  const maxVisible = 5;
  const halfVisible = Math.floor(maxVisible / 2);

  let start = Math.max(0, currentPage - halfVisible);
  let end = Math.min(totalPages, start + maxVisible);
  if (end - start < maxVisible) start = Math.max(0, end - maxVisible);

  if (start > 0) pages.push(0);
  if (start > 1) pages.push(null);
  for (let i = start; i < end; i++) pages.push(i);
  if (end < totalPages - 1) pages.push(null);
  if (end < totalPages) pages.push(totalPages - 1);

  const btn = (label: string, page: number, disabled: boolean) => (
    <button
      onClick={() => onPageChange(page)}
      disabled={disabled || isLoading}
      className="px-3 py-1.5 text-xs border border-[#222] rounded text-[#555] hover:text-white hover:border-[#444] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {label}
    </button>
  );

  return (
    <div className="flex gap-1.5 items-center justify-center py-3">
      {btn('â† Prev', currentPage - 1, currentPage === 0)}
      {pages.map((page, idx) =>
        page === null ? (
          <span key={`e-${idx}`} className="px-1 text-[#333] text-xs">â€¦</span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            disabled={isLoading}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              page === currentPage
                ? 'bg-white text-black font-bold'
                : 'text-[#555] hover:text-white hover:bg-[#1a1a1a]'
            }`}
          >
            {page + 1}
          </button>
        )
      )}
      {btn('Next â†’', currentPage + 1, currentPage >= totalPages - 1)}
    </div>
  );
};
