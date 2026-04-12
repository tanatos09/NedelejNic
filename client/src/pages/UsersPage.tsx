import React, { useState } from 'react';
import { UserTable } from '../components/admin/UserTable';
import { UserDetailModal } from '../components/admin/UserDetailModal';
import { LevelControlModal } from '../components/admin/LevelControlModal';
import { RoleChangeModal } from '../components/admin/RoleChangeModal';
import { ConfirmActionDialog } from '../components/admin/ConfirmActionDialog';
import { useAdminStore } from '../store/adminStore';

export const UsersPage: React.FC = () => {
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const { filters, setFilters } = useAdminStore();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-[#1a1a1a] pb-5">
        <h1 className="text-2xl font-bold text-white tracking-wide">Users</h1>
        <p className="text-[#444] text-sm mt-1">Správa hráčů a jejich přístupu</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-[10px] font-bold tracking-[2px] text-[#555] uppercase">Hledat</label>
          <input
            type="text"
            placeholder="Uživatelské jméno..."
            value={filters.search || ''}
            onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setPage(0); }}
            className="bg-[#111] border border-[#222] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#444] placeholder-[#444]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold tracking-[2px] text-[#555] uppercase">Role</label>
          <select
            value={filters.role || 'ALL'}
            onChange={(e) => setFilters({ ...filters, role: e.target.value as any })}
            className="bg-[#111] border border-[#222] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#444]"
          >
            <option value="ALL">Všechny role</option>
            <option value="PLAYER">Player</option>
            <option value="DEV">Dev</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold tracking-[2px] text-[#555] uppercase">Stav</label>
          <select
            value={filters.status || 'all'}
            onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
            className="bg-[#111] border border-[#222] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#444]"
          >
            <option value="all">Všechny</option>
            <option value="active">Aktivní</option>
            <option value="banned">Bani</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <UserTable
        page={page}
        pageSize={pageSize}
        filters={filters}
        onPageChange={setPage}
        onUserSelect={() => {}}
      />

      <UserDetailModal />
      <LevelControlModal />
      <RoleChangeModal />
      <ConfirmActionDialog />
    </div>
  );
};
