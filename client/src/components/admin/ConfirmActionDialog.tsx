import React from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useAdminStore } from '../../store/adminStore';
import {
  useResetUserProgressMutation,
  useToggleUserBanMutation,
} from '../../hooks/useAdminQueries';

export const ConfirmActionDialog: React.FC = () => {
  const {
    confirmDialogOpen,
    confirmDialog,
    selectedUserId,
    closeConfirmDialog,
    showToast,
    setActionLoading,
    isActionLoading,
  } = useAdminStore();

  const { mutate: resetProgress } = useResetUserProgressMutation();
  const { mutate: toggleBan } = useToggleUserBanMutation();

  if (!confirmDialogOpen || !selectedUserId || !confirmDialog) return null;

  const handleConfirm = async () => {
    const actionKey = `${confirmDialog.type}_${selectedUserId}`;
    setActionLoading(actionKey, true);

    try {
      if (confirmDialog.type === 'reset_progress') {
        resetProgress(selectedUserId, {
          onSuccess: () => {
            showToast({
              type: 'success',
              message: 'User progress reset to level 1',
              duration: 3000,
            });
            closeConfirmDialog();
          },
          onError: (error) => {
            showToast({
              type: 'error',
              message: error.message || 'Failed to reset progress',
              duration: 3000,
            });
          },
          onSettled: () => {
            setActionLoading(actionKey, false);
          },
        });
      } else if (confirmDialog.type === 'toggle_ban') {
        const isBanned = confirmDialog.title?.includes('Ban') && !confirmDialog.title?.includes('Unban');
        toggleBan(
          { userId: selectedUserId, isBanned },
          {
            onSuccess: () => {
              showToast({
                type: 'success',
                message: isBanned ? 'User banned' : 'User unbanned',
                duration: 3000,
              });
              closeConfirmDialog();
            },
            onError: (error) => {
              showToast({
                type: 'error',
                message: error.message || 'Failed to update ban status',
                duration: 3000,
              });
            },
            onSettled: () => {
              setActionLoading(actionKey, false);
            },
          }
        );
      }
    } catch (error) {
      showToast({
        type: 'error',
        message: 'An error occurred',
        duration: 3000,
      });
      setActionLoading(actionKey, false);
    }
  };

  const shouldShow =
    confirmDialogOpen &&
    (confirmDialog.type === 'reset_progress' || confirmDialog.type === 'toggle_ban');

  const isLoading = isActionLoading(`${confirmDialog.type}_${selectedUserId}`);

  return (
    <ConfirmDialog
      isOpen={shouldShow}
      title={confirmDialog.title}
      description={confirmDialog.description}
      isDangerous={
        confirmDialog.type === 'reset_progress' || confirmDialog.type === 'toggle_ban'
      }
      isLoading={isLoading}
      onConfirm={handleConfirm}
      onCancel={closeConfirmDialog}
      confirmLabel={
        confirmDialog.type === 'reset_progress'
          ? 'Reset Progress'
          : confirmDialog.type === 'toggle_ban'
            ? confirmDialog.title?.includes('Ban')
              ? 'Ban User'
              : 'Unban User'
            : 'Confirm'
      }
    />
  );
};
