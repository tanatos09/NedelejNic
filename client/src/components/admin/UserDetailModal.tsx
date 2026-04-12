import React from 'react';
import { Modal } from '../ui/Modal';
import { useAdminUserDetail } from '../../hooks/useAdminQueries';
import { useAdminStore } from '../../store/adminStore';

export const UserDetailModal: React.FC = () => {
  const { userDetailModalOpen, selectedUserId, closeUserDetailModal } = useAdminStore();
  const { data: userDetail, isLoading, error } = useAdminUserDetail(
    selectedUserId && userDetailModalOpen ? selectedUserId : null
  );

  if (!userDetailModalOpen || !selectedUserId) return null;

  return (
    <Modal
      isOpen={userDetailModalOpen}
      onClose={closeUserDetailModal}
      title="User Details"
    >
      {isLoading && <p className="text-[#555] text-sm">Načítám...</p>}
      {error && <p className="text-red-400 text-sm">Chyba: {error.message}</p>}

      {userDetail && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase mb-1">Jméno</p>
              <p className="text-white font-medium">{userDetail.username}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase mb-1">Role</p>
              <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                userDetail.role === 'ADMIN' ? 'bg-[#1a0000] text-[#cc4444]'
                : userDetail.role === 'DEV' ? 'bg-[#1a1400] text-[#a07800]'
                : 'bg-[#1a1a1a] text-[#888]'
              }`}>{userDetail.role}</span>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase mb-1">Level</p>
              <p className="text-white font-medium">{userDetail.level}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase mb-1">Status</p>
              {userDetail.isBanned
                ? <span className="text-xs text-red-400 font-bold">BAN</span>
                : <span className="text-xs text-green-400 font-bold">OK</span>
              }
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase mb-1">Vytvořen</p>
              <p className="text-sm text-[#888]">{new Date(userDetail.createdAt).toLocaleDateString('cs-CZ')}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase mb-1">Poslední přihlášení</p>
              <p className="text-sm text-[#888]">{userDetail.lastLogin ? new Date(userDetail.lastLogin).toLocaleDateString('cs-CZ') : '—'}</p>
            </div>
          </div>

          <div className="border-t border-[#1a1a1a] pt-4">
            <p className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase mb-3">Postup</p>
            <div className="flex justify-between text-xs text-[#666] mb-1.5">
              <span>Dokončeno</span>
              <span className="text-white">{userDetail.progressPercentage}%</span>
            </div>
            <div className="w-full bg-[#111] rounded-full h-1">
              <div
                className="bg-white h-1 rounded-full transition-all duration-300"
                style={{ width: `${userDetail.progressPercentage}%` }}
              />
            </div>
          </div>

          {userDetail.recentActivity && userDetail.recentActivity.length > 0 && (
            <div className="border-t border-[#1a1a1a] pt-4">
              <p className="text-[10px] font-bold tracking-[2px] text-[#444] uppercase mb-3">Nedávná aktivita</p>
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {userDetail.recentActivity.map((activity) => (
                  <div key={activity.id} className="text-xs text-[#666]">
                    <p>{activity.description}</p>
                    <span className="text-[#444]">{new Date(activity.timestamp).toLocaleString('cs-CZ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end border-t border-[#1a1a1a] pt-4">
        <button
          onClick={closeUserDetailModal}
          className="px-4 py-2 text-sm text-[#666] hover:text-white border border-[#222] hover:border-[#444] rounded transition-colors"
        >
          Zavřít
        </button>
      </div>
    </Modal>
  );
};
