import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useAdminStore } from '../../store/adminStore';
import { useChangeUserRoleMutation } from '../../hooks/useAdminQueries';
import { UserRole } from '../../types/admin';

export const RoleChangeModal: React.FC = () => {
  const {
    confirmDialogOpen,
    confirmDialog,
    selectedUserId,
    closeConfirmDialog,
    showToast,
    setActionLoading,
    isActionLoading,
  } = useAdminStore();

  const [newRole, setNewRole] = useState<UserRole>(UserRole.PLAYER);
  const { mutate: changeRole } = useChangeUserRoleMutation();

  if (!confirmDialogOpen || confirmDialog?.type !== 'change_role' || !selectedUserId) return null;

  const handleChangeRole = async () => {
    setActionLoading(`change_role_${selectedUserId}`, true);

    try {
      changeRole(
        { userId: selectedUserId, role: newRole },
        {
          onSuccess: () => {
            showToast({
              type: 'success',
              message: `Role changed to ${newRole}`,
              duration: 3000,
            });
            closeConfirmDialog();
          },
          onError: (error) => {
            showToast({
              type: 'error',
              message: error.message || 'Failed to change role',
              duration: 3000,
            });
          },
          onSettled: () => {
            setActionLoading(`change_role_${selectedUserId}`, false);
          },
        }
      );
    } catch (error) {
      showToast({
        type: 'error',
        message: 'An error occurred',
        duration: 3000,
      });
      setActionLoading(`change_role_${selectedUserId}`, false);
    }
  };

  const isLoading = isActionLoading(`change_role_${selectedUserId}`);

  return (
    <Modal
      isOpen={confirmDialogOpen && confirmDialog?.type === 'change_role'}
      onClose={closeConfirmDialog}
      title={confirmDialog?.title || 'Change Role'}
    >
      <div className="space-y-4">
        <p className="text-[#888] text-sm mb-4">{confirmDialog?.description}</p>

        <div className="space-y-2">
          {Object.values(UserRole).map((role) => (
            <label
              key={role}
              className={`flex items-center gap-3 px-4 py-3 border rounded cursor-pointer transition-colors ${
                newRole === role
                  ? 'border-white bg-[#111]'
                  : 'border-[#1a1a1a] hover:border-[#333] hover:bg-[#111]'
              }`}
            >
              <input
                type="radio"
                name="role"
                value={role}
                checked={newRole === role}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-4 h-4 accent-white"
              />
              <span className="flex-1">
                <span className={`text-sm font-medium ${
                  role === 'ADMIN' ? 'text-[#cc4444]'
                  : role === 'DEV' ? 'text-[#a07800]'
                  : 'text-[#888]'
                }`}>{role}</span>
                <span className="text-xs text-[#444] ml-2">
                  {role === UserRole.PLAYER && '— běžný hráč'}
                  {role === UserRole.DEV && '— vývojářský přístup'}
                  {role === UserRole.ADMIN && '— plný admin přístup'}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-3 border-t border-[#1a1a1a] pt-4">
        <button
          onClick={closeConfirmDialog}
          disabled={isLoading}
          className="px-4 py-2 text-sm text-[#666] hover:text-white border border-[#222] hover:border-[#444] rounded transition-colors disabled:opacity-40"
        >
          Zrušit
        </button>
        <button
          onClick={handleChangeRole}
          disabled={isLoading}
          className="px-4 py-2 text-sm bg-white hover:bg-[#ddd] text-black rounded transition-colors disabled:opacity-40"
        >
          {isLoading ? '...' : 'Změnit roli'}
        </button>
      </div>
    </Modal>
  );
};
