import React from 'react';
import { useAdminUsers } from '../../hooks/useAdminQueries';
import { Pagination } from '../ui/Pagination';
import { UserRow } from './UserRow';
import type { UserFilters } from '../../types/admin';

interface UserTableProps {
  page: number;
  pageSize: number;
  filters?: UserFilters;
  onPageChange: (page: number) => void;
  onUserSelect: (userId: string) => void;
}

export const UserTable: React.FC<UserTableProps> = ({
  page,
  pageSize,
  filters,
  onPageChange,
  onUserSelect,
}) => {
  const { data, isLoading, error } = useAdminUsers(page, pageSize, filters);

  if (error) {
    return (
      <div className="p-6 bg-[#110000] border border-[#2a0000] rounded text-center">
        <p className="text-red-400 font-medium text-sm">Chyba při načítání</p>
        <p className="text-[#666] text-xs mt-1">{error.message}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-10 text-center">
        <p className="text-[#444] text-sm">Načítám...</p>
      </div>
    );
  }

  const users = data?.users || [];
  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded border border-[#1a1a1a]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1a1a1a]">
              <th className="px-5 py-3 text-left text-[10px] font-bold tracking-[2px] text-[#444] uppercase">Uživatel</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold tracking-[2px] text-[#444] uppercase">Role</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold tracking-[2px] text-[#444] uppercase">Level</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold tracking-[2px] text-[#444] uppercase">Stav</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[#444] text-sm">
                  Žádní uživatelé
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <UserRow key={user.id} user={user} onSelect={onUserSelect} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
          isLoading={isLoading}
        />
      )}
    </div>
  );
};
